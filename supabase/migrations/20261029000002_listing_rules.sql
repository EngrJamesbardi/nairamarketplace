-- Listing business rules: currency integrity, prohibited items, listing allowances, lifecycle.

-- Country-specific (or global when country_code is null) prohibited-item policy terms.
create table public.prohibited_terms (
  id bigint generated always as identity primary key,
  country_code char(2) references public.countries(code),
  term text not null check (char_length(term) between 2 and 80),
  action text not null default 'review' check (action in ('review', 'block')),
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (country_code, term)
);

-- Country policy pages (prohibited items, safety, etc.) configurable by administrators.
create table public.country_policies (
  id bigint generated always as identity primary key,
  country_code char(2) references public.countries(code),
  kind text not null check (kind in ('prohibited_items', 'safety', 'terms_addendum', 'privacy_addendum')),
  title text not null,
  body text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (country_code, kind)
);

-- Platform-wide settings (tagline, limits). Values are JSON.
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Returns the active-listing allowance for a user (plan limit if subscribed, otherwise country free limit).
create or replace function public.active_listing_limit(p_user uuid, p_country char(2))
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_limit integer;
begin
  select free_active_listing_limit into v_limit from public.countries where code = p_country;
  -- subscription plans may raise the limit (table created in a later migration)
  if to_regclass('public.subscriptions') is not null then
    execute $q$
      select max(p.active_listing_limit)
      from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
      where s.user_id = $1 and s.status = 'active' and (s.current_period_end is null or s.current_period_end > now())
    $q$ into v_limit using p_user;
    if v_limit is null then
      select free_active_listing_limit into v_limit from public.countries where code = p_country;
    end if;
  end if;
  return coalesce(v_limit, 0);
end $$;

-- Returns the first matching prohibited term for a piece of text in a market (definer: terms are staff-only data).
create or replace function public.match_prohibited_term(p_text text, p_country char(2))
returns table(term text, action text) language sql stable security definer set search_path = public as $$
  select t.term, t.action from public.prohibited_terms t
  where (t.country_code is null or t.country_code = p_country)
    and lower(p_text) ~ ('\m' || regexp_replace(lower(t.term), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M')
  order by (t.action = 'block') desc
  limit 1;
$$;

-- SECURITY INVOKER so is_service()/is_staff() reflect the real caller.
create or replace function public.listing_before_write()
returns trigger language plpgsql set search_path = public as $$
declare
  v_country public.countries%rowtype;
  v_term record;
  v_active_count integer;
  v_trusted boolean := public.is_service() or public.is_staff();
begin
  select * into v_country from public.countries where code = new.country_code;
  if not found then
    raise exception 'Unknown country' using errcode = '23503';
  end if;

  -- Currency must match the listing's market. Prices are never silently converted.
  if new.currency is distinct from v_country.currency_code then
    raise exception 'Listing currency % does not match % market currency %', new.currency, new.country_code, v_country.currency_code
      using errcode = '23514';
  end if;

  if new.region_id is not null and not exists (select 1 from public.regions where id = new.region_id and country_code = new.country_code) then
    raise exception 'Region does not belong to the listing country' using errcode = '23514';
  end if;

  if new.subcategory_id is not null and not exists (select 1 from public.categories where id = new.subcategory_id and parent_id = new.category_id) then
    raise exception 'Subcategory does not belong to the selected category' using errcode = '23514';
  end if;

  if new.price_type = 'contact' then
    new.price_minor := null;
  end if;

  if not v_trusted then
    if not public.is_active_user(new.seller_id) then
      raise exception 'Account is not active' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      if not v_country.is_active then
        raise exception 'This market is not open for new listings yet' using errcode = '42501';
      end if;
      if not exists (select 1 from public.seller_profiles where user_id = new.seller_id) then
        raise exception 'Set up your seller storefront before listing' using errcode = '42501';
      end if;
      new.moderation_status := 'approved';
      new.moderation_note := null;
      new.view_count := 0; new.favourite_count := 0; new.message_count := 0;
      new.is_seed := false;
      new.sold_to := null; new.sold_at := null;
      if new.status not in ('draft', 'active') then new.status := 'active'; end if;
    else
      -- Sellers cannot change moderation-controlled or engagement fields.
      if new.moderation_status is distinct from old.moderation_status
         or new.moderation_note is distinct from old.moderation_note
         or new.view_count is distinct from old.view_count
         or new.favourite_count is distinct from old.favourite_count
         or new.message_count is distinct from old.message_count
         or new.is_seed is distinct from old.is_seed
         or new.seller_id is distinct from old.seller_id
         or new.country_code is distinct from old.country_code then
        raise exception 'Not allowed to change protected listing fields' using errcode = '42501';
      end if;
      if old.moderation_status in ('rejected', 'removed') and new.status = 'active' then
        raise exception 'This listing was removed by moderation and cannot be reactivated' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Prohibited-item screening (global + country-specific terms). Re-run when text changes.
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.description is distinct from old.description then
    select * into v_term from public.match_prohibited_term(new.title || ' ' || new.description, new.country_code);
    if v_term.term is not null then
      if v_term.action = 'block' and not v_trusted then
        raise exception 'This item appears to be prohibited in this market (%). See the prohibited items policy.', v_term.term using errcode = '23514';
      end if;
      if new.moderation_status = 'approved' then
        new.moderation_status := 'pending_review';
        new.moderation_note := 'Automatically held for review: matched policy term "' || v_term.term || '"';
      end if;
    end if;
  end if;

  -- Lifecycle timestamps.
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    new.published_at := coalesce(case when tg_op = 'UPDATE' and old.status in ('active','paused','reserved') then new.published_at end, now());
    new.expires_at := now() + make_interval(days => v_country.listing_duration_days);
  end if;
  if new.status = 'sold' and (tg_op = 'INSERT' or old.status is distinct from 'sold') then
    new.sold_at := now();
  end if;

  -- Transparent active-listing allowance.
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') and not v_trusted then
    select count(*) into v_active_count from public.listings
      where seller_id = new.seller_id and status = 'active' and id <> new.id;
    if v_active_count >= public.active_listing_limit(new.seller_id, new.country_code) then
      raise exception 'Active listing limit reached (%). Pause or archive a listing, or see optional plans.',
        public.active_listing_limit(new.seller_id, new.country_code) using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

create trigger listings_before_write before insert or update on public.listings
  for each row execute function public.listing_before_write();

-- Expire stale listings (call from a scheduled job; also safe to call manually).
create or replace function public.expire_listings()
returns integer language sql security definer set search_path = public as $$
  with x as (
    update public.listings set status = 'expired'
    where status = 'active' and expires_at is not null and expires_at < now()
    returning 1
  ) select count(*)::int from x;
$$;
revoke execute on function public.expire_listings() from public, anon, authenticated;

-- Renew an expired/active listing (owner only).
create or replace function public.renew_listing(p_listing uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.listings set status = 'active', expires_at = null
  where id = p_listing and seller_id = auth.uid() and status in ('active', 'expired', 'paused');
  if not found then
    raise exception 'Listing not found or cannot be renewed' using errcode = 'P0002';
  end if;
end $$;

-- De-duplicated view counter (one per viewer per day).
create or replace function public.record_listing_view(p_listing uuid, p_viewer_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_viewer_key is null or char_length(p_viewer_key) > 100 then return; end if;
  -- sellers viewing their own listings are not counted
  if exists (select 1 from public.listings where id = p_listing and seller_id = auth.uid()) then return; end if;
  insert into public.listing_view_events(listing_id, viewer_key) values (p_listing, p_viewer_key)
  on conflict do nothing;
  if found then
    update public.listings set view_count = view_count + 1 where id = p_listing;
  end if;
end $$;
