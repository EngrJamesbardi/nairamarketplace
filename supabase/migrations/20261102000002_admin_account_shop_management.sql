-- Administrator management of accounts, shops and listings.
--
--   Accounts: suspend / reinstate (existing), close / reopen (new: login is also banned by the app), permanently delete
--             (new: personal data anonymised, listings and their photos deleted, login revoked by the app).
--   Shops:    suspend / reinstate / close (new shop_status), permanently delete (listings + photos deleted, shop details
--             cleared; the row stays as an anonymous "Closed shop" so existing conversations keep working).
--   Listings: remove / restore (existing, reversible, photos kept), permanently delete (new, listing + photos).
--
-- Kept for history in every case: messages, offers (now detached from a deleted listing instead of deleted with it),
-- reviews, reports, payments, credit ledger, moderation actions and the audit log. A deleted member shows as
-- "Deleted member". Storage objects are removed by the server with the service key, using the paths these functions
-- return. All functions are administrator-only, refuse to act on the caller's own account, never leave the platform
-- without an active administrator, and write to the audit log.

-- ---------------------------------------------------------------------------
-- Shop status
-- ---------------------------------------------------------------------------
alter table public.seller_profiles
  add column shop_status text not null default 'active' check (shop_status in ('active', 'suspended', 'closed', 'deleted')),
  add column shop_status_reason text check (char_length(shop_status_reason) <= 300),
  add column shop_status_changed_at timestamptz;

-- Seller account active AND shop active: what the public may see.
create or replace function public.is_active_seller(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user(p_user)
     and exists (select 1 from public.seller_profiles where user_id = p_user and shop_status = 'active');
$$;
grant execute on function public.is_active_seller(uuid) to anon, authenticated, service_role;

drop policy listings_public_read on public.listings;
create policy listings_public_read on public.listings for select using (
  (status in ('active', 'reserved', 'sold') and moderation_status = 'approved' and public.is_active_seller(seller_id))
  or seller_id = auth.uid()
  or public.is_staff()
);

drop policy seller_profiles_read on public.seller_profiles;
create policy seller_profiles_read on public.seller_profiles for select
  using ((public.is_active_user(user_id) and shop_status = 'active') or user_id = auth.uid() or public.is_staff());

-- Owners cannot change their own shop status.
create or replace function public.protect_seller_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_service() or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.verified_at := null;
    new.is_featured := false;
    new.is_seed := false;
    new.shop_status := 'active';
    new.shop_status_reason := null;
    new.shop_status_changed_at := null;
    return new;
  end if;
  if new.verified_at is distinct from old.verified_at
     or new.is_featured is distinct from old.is_featured
     or new.is_seed is distinct from old.is_seed
     or (new.verification_status is distinct from old.verification_status) then
    raise exception 'Verification and featuring are controlled by administrators' using errcode = '42501';
  end if;
  if new.shop_status is distinct from old.shop_status
     or new.shop_status_reason is distinct from old.shop_status_reason
     or new.shop_status_changed_at is distinct from old.shop_status_changed_at then
    raise exception 'Shop status is controlled by administrators' using errcode = '42501';
  end if;
  return new;
end $$;

-- A shop that is not active cannot publish listings. Security invoker on purpose: is_service() must see the caller.
create or replace function public.listings_require_active_shop()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then
    return new;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and not exists (select 1 from public.seller_profiles where user_id = new.seller_id and shop_status = 'active') then
    raise exception 'Your shop is not active, so listings cannot be published. Contact support if you think this is a mistake.'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger listings_require_active_shop before insert or update of status on public.listings
  for each row execute function public.listings_require_active_shop();

-- Sponsored placements follow the same visibility rule.
create or replace function public.get_sponsored(p_placement public.promotion_placement, p_country char(2), p_category text default null,
  p_query text default null, p_limit integer default 2)
returns table (campaign_id uuid, listing_id uuid) language plpgsql stable security definer set search_path = public as $$
declare v_cap integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'max_sponsored_per_page'), 2);
begin
  return query
  select x.id, x.listing_id from (
    select distinct on (c.listing_id) c.id, c.listing_id
    from public.promotion_campaigns c
    join public.listings l on l.id = c.listing_id
    left join public.categories cat on cat.id = l.category_id
    where c.placement = p_placement and c.country_code = p_country and c.status = 'active'
      and c.starts_at <= now() and c.ends_at > now()
      and l.status = 'active' and l.moderation_status = 'approved' and public.is_active_seller(l.seller_id)
      and (auth.uid() is null or not public.is_blocked_between(auth.uid(), l.seller_id))
      and (p_category is null or cat.slug = p_category or exists (select 1 from public.categories s where s.id = l.subcategory_id and s.slug = p_category))
      and (p_query is null or p_query = '' or l.search_vector @@ websearch_to_tsquery('simple', p_query) or l.title ilike '%' || p_query || '%')
    order by c.listing_id, random()
  ) x
  order by random()
  limit least(greatest(coalesce(p_limit, 2), 0), v_cap);
end $$;
grant execute on function public.get_sponsored(public.promotion_placement, char, text, text, integer) to anon, authenticated;

-- Offers are transaction history: keep them (detached) when a listing is permanently deleted.
alter table public.offers alter column listing_id drop not null;
alter table public.offers drop constraint offers_listing_id_fkey;
alter table public.offers add constraint offers_listing_id_fkey foreign key (listing_id) references public.listings(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
-- Refuses to act on the caller's own account, and refuses to leave the platform without an active administrator.
create or replace function public._guard_account_target(p_user uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_user = auth.uid() then
    raise exception 'You cannot do this to your own account' using errcode = '42501';
  end if;
  if public.is_admin(p_user) and not exists (
    select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
    where r.role = 'admin' and p.status = 'active' and r.user_id <> p_user
  ) then
    raise exception 'This is the last active administrator' using errcode = '42501';
  end if;
end $$;
revoke execute on function public._guard_account_target(uuid) from public, anon, authenticated;

-- Listing photo paths in the listing-images bucket (seed drawings ship with the app and are skipped).
create or replace function public._listing_photo_paths(p_seller uuid default null, p_listing uuid default null)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(i.storage_path), '{}')
  from public.listing_images i join public.listings l on l.id = i.listing_id
  where (p_listing is null or l.id = p_listing) and (p_seller is null or l.seller_id = p_seller)
    and i.storage_path is not null and i.storage_path not like 'seed/%';
$$;
revoke execute on function public._listing_photo_paths(uuid, uuid) from public, anon, authenticated;

-- Clears a storefront's details and marks it deleted. The row stays so conversations keep their foreign key.
create or replace function public._clear_shop(p_seller uuid, p_reason text)
returns void language sql security definer set search_path = public as $$
  delete from public.seller_follows where seller_id = p_seller;
  update public.seller_profiles set shop_name = 'Closed shop', description = null, logo_url = null, banner_url = null,
    contact_email = null, contact_phone = null, whatsapp_number = null, show_whatsapp = false, business_name = null,
    business_registration_number = null, business_hours = null, delivery_notes = null, is_featured = false,
    slug = 'closed-' || substr(md5(p_seller::text), 1, 12),
    shop_status = 'deleted', shop_status_reason = p_reason, shop_status_changed_at = now()
  where user_id = p_seller;
$$;
revoke execute on function public._clear_shop(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
-- Suspend / reinstate, now also refusing closed or deleted accounts and the last active administrator.
create or replace function public.admin_set_user_status(p_user uuid, p_status public.account_status, p_reason text default null, p_until timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.account_status;
begin
  perform public._require_staff();
  if p_user = auth.uid() then raise exception 'You cannot change your own account status here' using errcode = '42501'; end if;
  if public.is_admin(p_user) and not public.is_admin() then raise exception 'Only administrators can act on administrators' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'Use active or suspended' using errcode = '22023'; end if;
  select status into v_old from public.profiles where id = p_user for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  if v_old in ('closed', 'deleted') then raise exception 'This account is closed or deleted. Use Reopen for closed accounts.' using errcode = '22023'; end if;
  if p_status = 'suspended' then perform public._guard_account_target(p_user); end if;
  update public.profiles set status = p_status,
    suspended_reason = case when p_status = 'suspended' then p_reason end,
    suspended_until = case when p_status = 'suspended' then p_until end
  where id = p_user;
  insert into public.moderation_actions(moderator_id, target_type, target_id, action, reason)
  values (auth.uid(), 'user', p_user::text, case when p_status = 'suspended' then 'suspend' else 'reinstate' end, p_reason);
  perform public.notify(p_user, 'moderation', case when p_status = 'suspended' then 'Your account has been suspended' else 'Your account has been reinstated' end, p_reason, '/account', '{}');
  perform public._audit('user.' || p_status, 'user', p_user::text, jsonb_build_object('reason', p_reason, 'until', p_until, 'previous', v_old));
end $$;

-- Close (p_close = true) or reopen an account. The server also bans / unbans the login with the service key.
create or replace function public.admin_set_account_closed(p_user uuid, p_close boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.account_status;
begin
  perform public._require_admin();
  perform public._guard_account_target(p_user);
  select status into v_old from public.profiles where id = p_user for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  if v_old = 'deleted' then raise exception 'This account has been deleted' using errcode = '22023'; end if;
  if p_close then
    if v_old = 'closed' then raise exception 'This account is already closed' using errcode = '22023'; end if;
    update public.profiles set status = 'closed', suspended_reason = p_reason, suspended_until = null where id = p_user;
  else
    if v_old <> 'closed' then raise exception 'Only closed accounts can be reopened' using errcode = '22023'; end if;
    update public.profiles set status = 'active', suspended_reason = null, suspended_until = null where id = p_user;
  end if;
  insert into public.moderation_actions(moderator_id, target_type, target_id, action, reason)
  values (auth.uid(), 'user', p_user::text, case when p_close then 'close' else 'reopen' end, p_reason);
  perform public._audit(case when p_close then 'user.closed' else 'user.reopened' end, 'user', p_user::text,
    jsonb_build_object('reason', p_reason, 'previous', v_old));
end $$;

-- Permanently delete an account: listings (and photos, via the returned paths) deleted, shop cleared, personal data
-- anonymised, roles removed. Returns the listing photo paths to delete from storage. Safe to repeat: a second call on a
-- deleted account changes nothing and returns no paths, so the server can retry removing the login.
create or replace function public.admin_delete_account(p_user uuid, p_reason text default null)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_old public.account_status; v_paths text[]; v_listings int;
begin
  perform public._require_admin();
  perform public._guard_account_target(p_user);
  select status into v_old from public.profiles where id = p_user for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  if v_old = 'deleted' then return '{}'; end if;

  v_paths := public._listing_photo_paths(p_user, null);
  delete from public.listings where seller_id = p_user;
  get diagnostics v_listings = row_count;
  if exists (select 1 from public.seller_profiles where user_id = p_user) then
    perform public._clear_shop(p_user, coalesce(p_reason, 'Account deleted'));
  end if;
  delete from public.favourites where user_id = p_user;
  delete from public.seller_follows where follower_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.blocked_users where blocker_id = p_user or blocked_id = p_user;
  delete from public.user_roles where user_id = p_user;
  update public.profiles set display_name = 'Deleted member', avatar_url = null, bio = null, city = null, phone = null, region_id = null,
    notification_prefs = '{}'::jsonb, marketing_consent_at = null, status = 'deleted', suspended_reason = null, suspended_until = null,
    deletion_requested_at = now()
  where id = p_user;

  insert into public.moderation_actions(moderator_id, target_type, target_id, action, reason)
  values (auth.uid(), 'user', p_user::text, 'delete', p_reason);
  perform public._audit('user.deleted', 'user', p_user::text,
    jsonb_build_object('reason', p_reason, 'previous', v_old, 'listings_deleted', v_listings, 'photos', coalesce(array_length(v_paths, 1), 0)));
  return v_paths;
end $$;

-- ---------------------------------------------------------------------------
-- Shops
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_shop_status(p_seller uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  perform public._require_admin();
  if p_status not in ('active', 'suspended', 'closed') then raise exception 'Use active, suspended or closed' using errcode = '22023'; end if;
  select shop_status into v_old from public.seller_profiles where user_id = p_seller for update;
  if not found then raise exception 'Shop not found' using errcode = 'P0002'; end if;
  if v_old = 'deleted' then raise exception 'This shop has been deleted' using errcode = '22023'; end if;
  if v_old = p_status then raise exception 'The shop is already %', p_status using errcode = '22023'; end if;
  update public.seller_profiles set shop_status = p_status, shop_status_changed_at = now(),
    shop_status_reason = case when p_status = 'active' then null else p_reason end
  where user_id = p_seller;
  perform public.notify(p_seller, 'moderation',
    case p_status when 'active' then 'Your shop has been reinstated' when 'suspended' then 'Your shop has been suspended' else 'Your shop has been closed' end,
    p_reason, '/dashboard', '{}');
  perform public._audit('shop.' || p_status, 'shop', p_seller::text, jsonb_build_object('reason', p_reason, 'previous', v_old));
end $$;

-- Permanently delete a shop: all its listings (and photos, via the returned paths) deleted, shop details cleared.
-- The owner's member account is not touched.
create or replace function public.admin_delete_shop(p_seller uuid, p_reason text default null)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_old text; v_name text; v_paths text[]; v_listings int;
begin
  perform public._require_admin();
  select shop_status, shop_name into v_old, v_name from public.seller_profiles where user_id = p_seller for update;
  if not found then raise exception 'Shop not found' using errcode = 'P0002'; end if;
  if v_old = 'deleted' then raise exception 'This shop has already been deleted' using errcode = '22023'; end if;
  v_paths := public._listing_photo_paths(p_seller, null);
  delete from public.listings where seller_id = p_seller;
  get diagnostics v_listings = row_count;
  perform public._clear_shop(p_seller, p_reason);
  perform public.notify(p_seller, 'moderation', 'Your shop has been deleted', p_reason, '/account', '{}');
  perform public._audit('shop.deleted', 'shop', p_seller::text,
    jsonb_build_object('reason', p_reason, 'shop_name', v_name, 'listings_deleted', v_listings, 'photos', coalesce(array_length(v_paths, 1), 0)));
  return v_paths;
end $$;

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_listing(p_listing uuid, p_reason text default null)
returns text[] language plpgsql security definer set search_path = public as $$
declare v record; v_paths text[];
begin
  perform public._require_admin();
  select id, title, seller_id, is_seed into v from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  v_paths := public._listing_photo_paths(null, p_listing);
  delete from public.listings where id = p_listing;
  insert into public.moderation_actions(moderator_id, target_type, target_id, action, reason)
  values (auth.uid(), 'listing', p_listing::text, 'delete', p_reason);
  perform public.notify(v.seller_id, 'moderation', 'Your listing was deleted', coalesce(p_reason, v.title), '/dashboard/listings', '{}');
  perform public._audit('listing.deleted', 'listing', p_listing::text,
    jsonb_build_object('reason', p_reason, 'title', v.title, 'seller', v.seller_id, 'is_seed', v.is_seed, 'photos', coalesce(array_length(v_paths, 1), 0)));
  return v_paths;
end $$;

revoke execute on function public.admin_set_account_closed(uuid, boolean, text), public.admin_delete_account(uuid, text),
  public.admin_set_shop_status(uuid, text, text), public.admin_delete_shop(uuid, text), public.admin_delete_listing(uuid, text)
  from public, anon;
grant execute on function public.admin_set_account_closed(uuid, boolean, text), public.admin_delete_account(uuid, text),
  public.admin_set_shop_status(uuid, text, text), public.admin_delete_shop(uuid, text), public.admin_delete_listing(uuid, text)
  to authenticated;
