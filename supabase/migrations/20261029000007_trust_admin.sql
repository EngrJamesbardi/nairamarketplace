-- Phase 3: trust & safety, administration, audit logging and privacy workflows.
-- All privileged operations are SECURITY DEFINER functions that (1) re-check the caller's role,
-- (2) perform the change and (3) write an immutable audit log entry.

-- ---------------------------------------------------------------------------
-- Immutable logs
-- ---------------------------------------------------------------------------
create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs(target_type, target_id);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  moderator_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('listing', 'user', 'review', 'message', 'report')),
  target_id text not null,
  action text not null,
  reason text,
  report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions(target_type, target_id);

create or replace function public.prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
create trigger admin_audit_logs_immutable before update or delete on public.admin_audit_logs for each row execute function public.prevent_mutation();
create trigger moderation_actions_immutable before update or delete on public.moderation_actions for each row execute function public.prevent_mutation();

create or replace function public._audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;
revoke execute on function public._audit(text, text, text, jsonb) from public, anon, authenticated;

create or replace function public._require_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff access required' using errcode = '42501'; end if;
end $$;
create or replace function public._require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seller verification records
-- ---------------------------------------------------------------------------
create table public.seller_verifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  kind text not null default 'business' check (kind in ('business', 'identity')),
  business_name text check (char_length(business_name) <= 120),
  registration_number text check (char_length(registration_number) <= 60),
  notes text check (char_length(notes) <= 1000),
  status public.verification_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index seller_verifications_status_idx on public.seller_verifications(status, created_at);

create or replace function public.request_seller_verification(p_business_name text, p_registration_number text, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.seller_profiles where user_id = auth.uid()) then
    raise exception 'Set up a storefront first' using errcode = '42501';
  end if;
  if exists (select 1 from public.seller_verifications where seller_id = auth.uid() and status = 'pending') then
    raise exception 'You already have a pending verification request' using errcode = '23505';
  end if;
  insert into public.seller_verifications(seller_id, business_name, registration_number, notes)
  values (auth.uid(), left(p_business_name, 120), left(p_registration_number, 60), left(p_notes, 1000)) returning id into v_id;
  update public.seller_profiles set verification_status = 'pending' where user_id = auth.uid() and verification_status <> 'verified';
  return v_id;
end $$;

-- verification_status 'pending' is set by the definer function above; allow that path through the protect trigger
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
    return new;
  end if;
  if new.verified_at is distinct from old.verified_at
     or new.is_featured is distinct from old.is_featured
     or new.is_seed is distinct from old.is_seed
     or (new.verification_status is distinct from old.verification_status) then
    raise exception 'Verification and featuring are controlled by administrators' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.admin_review_verification(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.seller_verifications%rowtype;
begin
  perform public._require_admin();
  select * into v from public.seller_verifications where id = p_id for update;
  if not found or v.status <> 'pending' then raise exception 'Verification request not found or already decided' using errcode = 'P0002'; end if;
  update public.seller_verifications set status = case when p_approve then 'verified'::public.verification_status else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), decision_note = p_note where id = p_id;
  update public.seller_profiles set verification_status = case when p_approve then 'verified'::public.verification_status else 'rejected' end,
    verified_at = case when p_approve then now() else null end where user_id = v.seller_id;
  perform public.notify(v.seller_id, 'system', case when p_approve then 'Your business is now verified' else 'Verification not approved' end, p_note, '/dashboard', '{}');
  perform public._audit(case when p_approve then 'verification.approve' else 'verification.reject' end, 'seller', v.seller_id::text, jsonb_build_object('request', p_id, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------
create or replace function public.moderate_listing(p_listing uuid, p_action text, p_reason text default null, p_report uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.listings%rowtype; v_status public.moderation_status;
begin
  perform public._require_staff();
  v_status := case p_action when 'approve' then 'approved' when 'restore' then 'approved' when 'reject' then 'rejected' when 'remove' then 'removed' end;
  if v_status is null then raise exception 'Invalid moderation action' using errcode = '22023'; end if;
  select * into v from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  update public.listings set moderation_status = v_status, moderation_note = p_reason where id = p_listing;
  insert into public.moderation_actions(moderator_id, target_type, target_id, action, reason, report_id)
  values (auth.uid(), 'listing', p_listing::text, p_action, p_reason, p_report);
  perform public.notify(v.seller_id, 'moderation',
    case v_status when 'approved' then 'Your listing is live' else 'Your listing was removed' end,
    v.title || coalesce(' — ' || p_reason, ''), '/dashboard/listings/' || p_listing || '/edit', '{}');
  perform public._audit('listing.' || p_action, 'listing', p_listing::text, jsonb_build_object('reason', p_reason, 'previous', v.moderation_status));
end $$;

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
  update public.profiles set status = p_status,
    suspended_reason = case when p_status = 'suspended' then p_reason end,
    suspended_until = case when p_status = 'suspended' then p_until end
  where id = p_user;
  insert into public.moderation_actions(moderator_id, target_type, target_id, action, reason)
  values (auth.uid(), 'user', p_user::text, case when p_status = 'suspended' then 'suspend' else 'reinstate' end, p_reason);
  perform public.notify(p_user, 'moderation', case when p_status = 'suspended' then 'Your account has been suspended' else 'Your account has been reinstated' end, p_reason, '/account', '{}');
  perform public._audit('user.' || p_status, 'user', p_user::text, jsonb_build_object('reason', p_reason, 'until', p_until, 'previous', v_old));
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_user = auth.uid() and not p_grant then raise exception 'You cannot remove your own role' using errcode = '42501'; end if;
  if p_grant then
    insert into public.user_roles(user_id, role, granted_by) values (p_user, p_role, auth.uid()) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
  perform public._audit(case when p_grant then 'role.grant' else 'role.revoke' end, 'user', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.resolve_report(p_report uuid, p_status public.report_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_staff();
  update public.reports set status = p_status, resolution_note = p_note, handled_by = auth.uid(),
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
  where id = p_report;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  insert into public.moderation_actions(moderator_id, target_type, target_id, action, reason, report_id)
  values (auth.uid(), 'report', p_report::text, p_status::text, p_note, p_report);
  perform public._audit('report.' || p_status, 'report', p_report::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_set_review_status(p_review uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_staff();
  update public.reviews set status = p_status where id = p_review;
  if not found then raise exception 'Review not found' using errcode = 'P0002'; end if;
  insert into public.moderation_actions(moderator_id, target_type, target_id, action, reason) values (auth.uid(), 'review', p_review::text, p_status, p_reason);
  perform public._audit('review.' || p_status, 'review', p_review::text, jsonb_build_object('reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Configuration (countries, categories, policies, settings)
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_country(p_code char(2), p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  perform public._require_admin();
  select to_jsonb(c) into v_old from public.countries c where code = p_code;
  if v_old is null then raise exception 'Country not found' using errcode = 'P0002'; end if;
  update public.countries set
    is_active = coalesce((p_patch ->> 'is_active')::boolean, is_active),
    allow_cross_border_discovery = coalesce((p_patch ->> 'allow_cross_border_discovery')::boolean, allow_cross_border_discovery),
    free_active_listing_limit = coalesce((p_patch ->> 'free_active_listing_limit')::int, free_active_listing_limit),
    listing_duration_days = coalesce((p_patch ->> 'listing_duration_days')::int, listing_duration_days),
    payment_provider = case when p_patch ? 'payment_provider' then nullif(p_patch ->> 'payment_provider', '') else payment_provider end
  where code = p_code;
  perform public._audit('country.update', 'country', p_code, jsonb_build_object('patch', p_patch, 'before', v_old));
end $$;

create or replace function public.admin_upsert_category(p_id bigint, p_parent bigint, p_slug text, p_name text, p_icon text, p_sort int, p_active boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public._require_admin();
  if p_id is null then
    insert into public.categories(parent_id, slug, name, icon, sort_order, is_active) values (p_parent, p_slug, p_name, p_icon, coalesce(p_sort, 0), coalesce(p_active, true)) returning id into v_id;
  else
    update public.categories set parent_id = p_parent, slug = p_slug, name = p_name, icon = p_icon, sort_order = coalesce(p_sort, sort_order), is_active = coalesce(p_active, is_active)
    where id = p_id returning id into v_id;
  end if;
  perform public._audit(case when p_id is null then 'category.create' else 'category.update' end, 'category', v_id::text,
    jsonb_build_object('slug', p_slug, 'name', p_name, 'active', p_active, 'parent', p_parent));
  return v_id;
end $$;

create or replace function public.admin_set_prohibited_term(p_country char(2), p_term text, p_action text, p_reason text, p_delete boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_delete then
    delete from public.prohibited_terms where term = lower(p_term) and country_code is not distinct from p_country;
  else
    insert into public.prohibited_terms(country_code, term, action, reason, created_by) values (p_country, lower(trim(p_term)), p_action, p_reason, auth.uid())
    on conflict (country_code, term) do update set action = excluded.action, reason = excluded.reason;
  end if;
  perform public._audit(case when p_delete then 'policy.term.delete' else 'policy.term.set' end, 'prohibited_term', coalesce(p_country, 'ALL') || ':' || p_term,
    jsonb_build_object('action', p_action, 'reason', p_reason));
end $$;

create or replace function public.admin_set_policy(p_country char(2), p_kind text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.country_policies set title = p_title, body = p_body, updated_by = auth.uid(), updated_at = now()
  where kind = p_kind and country_code is not distinct from p_country;
  if not found then
    insert into public.country_policies(country_code, kind, title, body, updated_by) values (p_country, p_kind, p_title, p_body, auth.uid());
  end if;
  perform public._audit('policy.update', 'policy', coalesce(p_country, 'ALL') || ':' || p_kind, jsonb_build_object('title', p_title));
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  insert into public.platform_settings(key, value, updated_by, updated_at) values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform public._audit('setting.update', 'setting', p_key, jsonb_build_object('value', p_value));
end $$;

create or replace function public.admin_feature_seller(p_seller uuid, p_featured boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.seller_profiles set is_featured = p_featured where user_id = p_seller;
  perform public._audit(case when p_featured then 'seller.feature' else 'seller.unfeature' end, 'seller', p_seller::text, '{}');
end $$;

-- Staff user directory (includes private fields + email, so it is staff-only).
create or replace function public.admin_list_users(p_query text default null, p_status public.account_status default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, display_name text, country_code char(2), status public.account_status, suspended_reason text,
               created_at timestamptz, last_sign_in_at timestamptz, roles text[], shop_name text, shop_slug text, listing_count bigint, report_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_staff();
  return query
  select p.id, u.email::text, p.display_name, p.country_code, p.status, p.suspended_reason, p.created_at, u.last_sign_in_at,
    coalesce((select array_agg(r.role::text) from public.user_roles r where r.user_id = p.id), '{}'),
    s.shop_name, s.slug::text,
    (select count(*) from public.listings l where l.seller_id = p.id),
    (select count(*) from public.reports rp where rp.reported_user_id = p.id)
  from public.profiles p join auth.users u on u.id = p.id
  left join public.seller_profiles s on s.user_id = p.id
  where (p_query is null or p.display_name ilike '%' || p_query || '%' or u.email ilike '%' || p_query || '%' or s.shop_name ilike '%' || p_query || '%')
    and (p_status is null or p.status = p_status)
  order by p.created_at desc
  limit least(p_limit, 200) offset p_offset;
end $$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._require_staff();
  select jsonb_build_object(
    'users', (select count(*) from public.profiles where status <> 'deleted'),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'sellers', (select count(*) from public.seller_profiles),
    'active_listings', (select count(*) from public.listings where status = 'active' and moderation_status = 'approved'),
    'listings_7d', (select count(*) from public.listings where created_at > now() - interval '7 days'),
    'pending_review', (select count(*) from public.listings where moderation_status = 'pending_review'),
    'open_reports', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'conversations_7d', (select count(*) from public.conversations where created_at > now() - interval '7 days'),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'offers_7d', (select count(*) from public.offers where created_at > now() - interval '7 days'),
    'accepted_offers_7d', (select count(*) from public.offers where status = 'accepted' and responded_at > now() - interval '7 days'),
    'pending_verifications', (select count(*) from public.seller_verifications where status = 'pending'),
    'by_country', (select coalesce(jsonb_object_agg(country_code, n), '{}') from (select country_code, count(*) n from public.listings where status = 'active' group by 1) x)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Privacy: deactivation, deletion, retention
-- ---------------------------------------------------------------------------
-- Anonymises the caller's profile and storefront, archives listings and removes personal social data.
-- Message history is kept for the other party but attributed to "Deleted member". Platform payment
-- records are retained where the law requires (see docs/PRIVACY_AND_COMPLIANCE.md).
create or replace function public.anonymise_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  update public.listings set status = 'archived' where seller_id = v_me and status <> 'archived';
  delete from public.favourites where user_id = v_me;
  delete from public.seller_follows where follower_id = v_me or seller_id = v_me;
  delete from public.notifications where user_id = v_me;
  delete from public.blocked_users where blocker_id = v_me;
  update public.seller_profiles set shop_name = 'Closed shop', description = null, logo_url = null, banner_url = null,
    contact_email = null, contact_phone = null, whatsapp_number = null, show_whatsapp = false, business_name = null,
    business_registration_number = null, business_hours = null, delivery_notes = null, slug = 'closed-' || substr(md5(v_me::text), 1, 12)
  where user_id = v_me;
  update public.profiles set display_name = 'Deleted member', avatar_url = null, bio = null, city = null, phone = null, region_id = null,
    notification_prefs = '{}'::jsonb, marketing_consent_at = null, status = 'deleted', deletion_requested_at = now()
  where id = v_me;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id) values (v_me, 'account.self_delete', 'user', v_me::text);
end $$;
grant execute on function public.anonymise_my_account() to authenticated;

-- Allow the deletion path (definer, runs as owner) through the profile protection trigger: is_service() is true there.

create or replace function public.purge_expired_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare a int; b int; c int;
begin
  delete from public.notifications where read_at is not null and created_at < now() - interval '180 days'; get diagnostics a = row_count;
  delete from public.listing_view_events where day < current_date - 90; get diagnostics b = row_count;
  update public.listings set status = 'expired' where status = 'active' and expires_at < now(); get diagnostics c = row_count;
  perform public.expire_offers();
  return jsonb_build_object('notifications', a, 'view_events', b, 'expired_listings', c);
end $$;
revoke execute on function public.purge_expired_data() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS for new tables
-- ---------------------------------------------------------------------------
alter table public.admin_audit_logs enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.seller_verifications enable row level security;

create policy audit_admin_read on public.admin_audit_logs for select using (public.is_admin());
create policy moderation_staff_read on public.moderation_actions for select using (public.is_staff());
create policy verifications_read on public.seller_verifications for select using (seller_id = auth.uid() or public.is_staff());
revoke insert, update, delete on public.admin_audit_logs, public.moderation_actions, public.seller_verifications from anon, authenticated;

-- Staff can read reports + private listing info via existing policies (is_staff()).

grant execute on function public.moderate_listing(uuid, text, text, uuid), public.admin_set_user_status(uuid, public.account_status, text, timestamptz),
  public.admin_set_role(uuid, public.app_role, boolean), public.resolve_report(uuid, public.report_status, text),
  public.admin_set_review_status(uuid, text, text), public.admin_update_country(char, jsonb),
  public.admin_upsert_category(bigint, bigint, text, text, text, int, boolean), public.admin_set_prohibited_term(char, text, text, text, boolean),
  public.admin_set_policy(char, text, text, text), public.admin_set_setting(text, jsonb), public.admin_feature_seller(uuid, boolean),
  public.admin_list_users(text, public.account_status, int, int), public.admin_stats(), public.admin_review_verification(uuid, boolean, text),
  public.request_seller_verification(text, text, text) to authenticated;
revoke execute on function public.moderate_listing(uuid, text, text, uuid), public.admin_set_user_status(uuid, public.account_status, text, timestamptz),
  public.admin_set_role(uuid, public.app_role, boolean), public.resolve_report(uuid, public.report_status, text),
  public.admin_list_users(text, public.account_status, int, int), public.admin_stats() from anon;
