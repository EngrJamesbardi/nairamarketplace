-- Phase 4: optional paid services for sellers. Buying, selling and listing stay free; there are no
-- transaction commissions, no compulsory checkout and no platform-controlled logistics.
--
-- Money rules:
--  * Credits live in an append-only ledger (credit_transactions). credit_accounts.balance is a cached
--    running total that is only changed inside _apply_credits(), under a row lock, together with the ledger row.
--  * Every ledger row has a unique idempotency key, so retries and duplicate webhooks cannot double-grant or double-spend.
--  * Payments are completed only by complete_payment(), which is executable by the service role alone (called from
--    the server after verifying a provider webhook signature). A browser redirect never grants anything.

create type public.credit_tx_kind as enum ('purchase', 'subscription_grant', 'promotion_spend', 'promotion_refund', 'admin_grant', 'admin_debit');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'cancelled', 'refunded');
create type public.payment_purpose as enum ('credits', 'subscription');
create type public.promotion_placement as enum ('search', 'homepage', 'category');
create type public.campaign_status as enum ('active', 'paused', 'ended', 'cancelled', 'removed');
create type public.subscription_status as enum ('active', 'expired', 'replaced');

-- ---------------------------------------------------------------------------
-- Catalogue (admin-managed, per market, priced in that market's currency)
-- ---------------------------------------------------------------------------
create table public.credit_packages (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.countries(code),
  name text not null check (char_length(name) between 2 and 60),
  credits integer not null check (credits > 0 and credits <= 100000),
  price_minor bigint not null check (price_minor > 0),
  currency char(3) not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9-]{2,40}$'),
  country_code char(2) not null references public.countries(code),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 500),
  price_minor bigint not null check (price_minor > 0),
  currency char(3) not null,
  period_days integer not null default 30 check (period_days between 1 and 366),
  active_listing_limit integer not null check (active_listing_limit > 0),
  monthly_credits integer not null default 0 check (monthly_credits >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, code)
);

create table public.promotion_prices (
  country_code char(2) not null references public.countries(code),
  placement public.promotion_placement not null,
  credits_per_day integer not null check (credits_per_day > 0 and credits_per_day <= 10000),
  updated_at timestamptz not null default now(),
  primary key (country_code, placement)
);

-- Catalogue prices must be in the market's currency.
create or replace function public.catalogue_currency_check()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.currency <> (select currency_code from public.countries where code = new.country_code) then
    raise exception 'Price currency must match the market currency' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger credit_packages_currency before insert or update on public.credit_packages for each row execute function public.catalogue_currency_check();
create trigger subscription_plans_currency before insert or update on public.subscription_plans for each row execute function public.catalogue_currency_check();

-- ---------------------------------------------------------------------------
-- Credits ledger
-- ---------------------------------------------------------------------------
create table public.credit_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  kind public.credit_tx_kind not null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 200),
  reference_type text,
  reference_id text,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index credit_transactions_user_idx on public.credit_transactions(user_id, created_at desc);
create trigger credit_transactions_immutable before update or delete on public.credit_transactions
  for each row execute function public.prevent_mutation();

-- The only way credits move. Locks the account row so concurrent spends are serialised.
create or replace function public._apply_credits(p_user uuid, p_delta bigint, p_kind public.credit_tx_kind, p_idem text,
  p_ref_type text, p_ref_id text, p_description text, p_actor uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_balance bigint; v_existing bigint; v_id bigint;
begin
  if p_delta = 0 then raise exception 'Credit change must not be zero' using errcode = '22023'; end if;
  insert into public.credit_accounts(user_id) values (p_user) on conflict do nothing;
  select balance into v_balance from public.credit_accounts where user_id = p_user for update;
  select id into v_existing from public.credit_transactions where idempotency_key = p_idem;
  if v_existing is not null then return v_existing; end if;  -- already applied: idempotent no-op
  if v_balance + p_delta < 0 then
    raise exception 'Not enough credits (balance %, needed %)', v_balance, -p_delta using errcode = 'P0402';
  end if;
  update public.credit_accounts set balance = v_balance + p_delta, updated_at = now() where user_id = p_user;
  insert into public.credit_transactions(user_id, delta, balance_after, kind, idempotency_key, reference_type, reference_id, description, created_by)
  values (p_user, p_delta, v_balance + p_delta, p_kind, p_idem, p_ref_type, p_ref_id, left(p_description, 300), p_actor)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public._apply_credits(uuid, bigint, public.credit_tx_kind, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.my_credit_balance()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select balance from public.credit_accounts where user_id = auth.uid()), 0);
$$;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status public.subscription_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscriptions_one_active on public.subscriptions(user_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Platform payments (for credits and plans only, never for goods between members)
-- ---------------------------------------------------------------------------
create table public.platform_payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('NM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20))),
  user_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null,
  purpose public.payment_purpose not null,
  package_id uuid references public.credit_packages(id),
  plan_id uuid references public.subscription_plans(id),
  country_code char(2) not null references public.countries(code),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  credits integer check (credits > 0),
  status public.payment_status not null default 'pending',
  provider_transaction_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((purpose = 'credits' and package_id is not null and credits is not null) or (purpose = 'subscription' and plan_id is not null))
);
create index platform_payments_user_idx on public.platform_payments(user_id, created_at desc);
create index platform_payments_status_idx on public.platform_payments(status, created_at desc);

-- Raw provider callbacks, deduplicated by (provider, event_id). Kept for reconciliation and audit.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  reference text,
  event_type text,
  signature_valid boolean not null,
  result text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
create trigger payment_events_immutable before update or delete on public.payment_events
  for each row execute function public.prevent_mutation();

create or replace function public.start_checkout(p_purpose public.payment_purpose, p_item uuid)
returns table (payment_id uuid, reference text, provider text, amount_minor bigint, currency char(3), description text)
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_pkg public.credit_packages%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_country public.countries%rowtype;
  v_pay public.platform_payments%rowtype;
begin
  if v_me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not public.is_active_user(v_me) then raise exception 'Your account cannot make purchases right now' using errcode = '42501'; end if;
  perform public.assert_rate((select count(*) from public.platform_payments where user_id = v_me and created_at > now() - interval '1 hour'), 10, 'checkout attempts');
  if p_purpose = 'credits' then
    select * into v_pkg from public.credit_packages where id = p_item and is_active;
    if not found then raise exception 'That credit package is not available' using errcode = 'P0002'; end if;
    select * into v_country from public.countries where code = v_pkg.country_code;
  else
    select * into v_plan from public.subscription_plans where id = p_item and is_active;
    if not found then raise exception 'That plan is not available' using errcode = 'P0002'; end if;
    select * into v_country from public.countries where code = v_plan.country_code;
  end if;
  if not v_country.is_active then raise exception '% is not open yet', v_country.name using errcode = '22023'; end if;
  if v_country.payment_provider is null or v_country.payment_provider = '' then
    raise exception 'Payments are not available in % yet', v_country.name using errcode = '22023';
  end if;
  if p_purpose = 'credits' then
    insert into public.platform_payments(user_id, provider, purpose, package_id, country_code, amount_minor, currency, credits)
    values (v_me, v_country.payment_provider, 'credits', v_pkg.id, v_pkg.country_code, v_pkg.price_minor, v_pkg.currency, v_pkg.credits)
    returning * into v_pay;
    return query select v_pay.id, v_pay.reference, v_pay.provider, v_pay.amount_minor, v_pay.currency, v_pkg.name || ' (' || v_pkg.credits || ' credits)';
  else
    insert into public.platform_payments(user_id, provider, purpose, plan_id, country_code, amount_minor, currency)
    values (v_me, v_country.payment_provider, 'subscription', v_plan.id, v_plan.country_code, v_plan.price_minor, v_plan.currency)
    returning * into v_pay;
    return query select v_pay.id, v_pay.reference, v_pay.provider, v_pay.amount_minor, v_pay.currency, v_plan.name || ' plan (' || v_plan.period_days || ' days)';
  end if;
end $$;

-- Service role only. Called after the server has verified the provider's signature (or re-queried the provider).
-- Idempotent: a second call for the same payment returns 'already_processed' and changes nothing.
create or replace function public.complete_payment(p_provider text, p_reference text, p_amount_minor bigint, p_currency text, p_provider_tx text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.platform_payments%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_sub public.subscriptions%rowtype;
begin
  select * into v from public.platform_payments where reference = p_reference for update;
  if not found then return 'unknown_reference'; end if;
  if v.provider <> p_provider then return 'provider_mismatch'; end if;
  if v.status = 'succeeded' then return 'already_processed'; end if;
  if v.status not in ('pending', 'failed') then return 'not_payable'; end if;
  if p_amount_minor is distinct from v.amount_minor or upper(p_currency) is distinct from v.currency then
    update public.platform_payments set status = 'failed', failure_reason = format('Amount mismatch: got %s %s', p_amount_minor, p_currency), updated_at = now() where id = v.id;
    perform public._audit('payment.amount_mismatch', 'payment', v.id::text, jsonb_build_object('expected', v.amount_minor, 'got', p_amount_minor, 'currency', p_currency));
    return 'amount_mismatch';
  end if;

  update public.platform_payments set status = 'succeeded', provider_transaction_id = p_provider_tx, failure_reason = null,
    completed_at = now(), updated_at = now() where id = v.id;

  if v.purpose = 'credits' then
    perform public._apply_credits(v.user_id, v.credits, 'purchase', 'payment:' || v.id, 'payment', v.id::text, 'Bought ' || v.credits || ' credits');
    perform public.notify(v.user_id, 'payment', 'Payment received', v.credits || ' credits were added to your account.', '/dashboard/credits', '{}');
  else
    select * into v_plan from public.subscription_plans where id = v.plan_id;
    select * into v_sub from public.subscriptions where user_id = v.user_id and status = 'active' for update;
    if found and v_sub.plan_id = v_plan.id then
      -- Renewal: extend from the later of now and the current end.
      update public.subscriptions set current_period_end = greatest(current_period_end, now()) + make_interval(days => v_plan.period_days),
        cancel_at_period_end = false, updated_at = now() where id = v_sub.id;
    else
      if found then update public.subscriptions set status = 'replaced', updated_at = now() where id = v_sub.id; end if;
      insert into public.subscriptions(user_id, plan_id, current_period_end) values (v.user_id, v_plan.id, now() + make_interval(days => v_plan.period_days));
    end if;
    if v_plan.monthly_credits > 0 then
      perform public._apply_credits(v.user_id, v_plan.monthly_credits, 'subscription_grant', 'payment:' || v.id || ':plan-credits', 'payment', v.id::text, v_plan.name || ' plan credits');
    end if;
    perform public.notify(v.user_id, 'payment', 'Your ' || v_plan.name || ' plan is active', null, '/dashboard/plan', '{}');
  end if;
  return 'succeeded';
end $$;

create or replace function public.fail_payment(p_provider text, p_reference text, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.platform_payments set status = 'failed', failure_reason = left(p_reason, 300), updated_at = now()
  where reference = p_reference and provider = p_provider and status = 'pending';
  return case when found then 'failed' else 'ignored' end;
end $$;

-- Records a provider callback once. Returns false when the event was already seen.
create or replace function public.record_payment_event(p_provider text, p_event_id text, p_reference text, p_type text, p_valid boolean, p_result text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_events(provider, event_id, reference, event_type, signature_valid, result, payload)
  values (p_provider, p_event_id, p_reference, p_type, p_valid, p_result, coalesce(p_payload, '{}'));
  return true;
exception when unique_violation then
  return false;
end $$;

revoke execute on function public.complete_payment(text, text, bigint, text, text), public.fail_payment(text, text, text),
  public.record_payment_event(text, text, text, text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_payment(text, text, bigint, text, text), public.fail_payment(text, text, text),
  public.record_payment_event(text, text, text, text, boolean, text, jsonb) to service_role;

create or replace function public.cancel_my_subscription(p_cancel boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.subscriptions set cancel_at_period_end = p_cancel, updated_at = now() where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'You do not have an active plan' using errcode = 'P0002'; end if;
end $$;

create or replace function public.expire_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.subscriptions set status = 'expired', updated_at = now() where status = 'active' and current_period_end <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.expire_subscriptions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Promotion campaigns (flat price per day; impressions and clicks are measured, never charged)
-- ---------------------------------------------------------------------------
create table public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  country_code char(2) not null references public.countries(code),
  placement public.promotion_placement not null,
  category_id bigint references public.categories(id),
  days integer not null check (days between 1 and 30),
  credits_per_day integer not null check (credits_per_day > 0),
  credits_charged integer not null check (credits_charged > 0),
  credits_refunded integer not null default 0 check (credits_refunded >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status public.campaign_status not null default 'active',
  status_note text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index promotion_campaigns_serve_idx on public.promotion_campaigns(placement, country_code, status, ends_at);
create index promotion_campaigns_seller_idx on public.promotion_campaigns(seller_id, created_at desc);
create unique index promotion_campaigns_one_live on public.promotion_campaigns(listing_id, placement) where status in ('active', 'paused');

create table public.promotion_events (
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  kind text not null check (kind in ('impression', 'click')),
  viewer_key text not null check (char_length(viewer_key) between 16 and 128),
  day date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (campaign_id, kind, viewer_key, day)
);

create or replace function public.create_promotion(p_listing uuid, p_placement public.promotion_placement, p_days integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  l public.listings%rowtype;
  v_price integer;
  v_id uuid := gen_random_uuid();
begin
  if v_me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not public.is_active_user(v_me) then raise exception 'Your account cannot promote listings right now' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 30 then raise exception 'Choose between 1 and 30 days' using errcode = '22023'; end if;
  perform public.assert_rate((select count(*) from public.promotion_campaigns where seller_id = v_me and created_at > now() - interval '1 hour'), 20, 'promotions');
  select * into l from public.listings where id = p_listing for share;
  if not found or l.seller_id <> v_me then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  if l.status <> 'active' or l.moderation_status <> 'approved' then
    raise exception 'Only active, approved listings can be promoted' using errcode = '22023';
  end if;
  select credits_per_day into v_price from public.promotion_prices where country_code = l.country_code and placement = p_placement;
  if v_price is null then raise exception 'This placement is not available in your market' using errcode = '22023'; end if;
  if exists (select 1 from public.promotion_campaigns where listing_id = p_listing and placement = p_placement and status in ('active', 'paused')) then
    raise exception 'This listing already has a running promotion in that placement' using errcode = '23505';
  end if;
  insert into public.promotion_campaigns(id, seller_id, listing_id, country_code, placement, category_id, days, credits_per_day, credits_charged, ends_at)
  values (v_id, v_me, p_listing, l.country_code, p_placement, case when p_placement = 'category' then l.category_id end,
          p_days, v_price, v_price * p_days, now() + make_interval(days => p_days));
  -- Debit in the same transaction: if the balance is short, the campaign insert is rolled back too.
  perform public._apply_credits(v_me, -(v_price * p_days)::bigint, 'promotion_spend', 'campaign:' || v_id, 'campaign', v_id::text,
    format('Promote "%s" (%s, %s days)', left(l.title, 60), p_placement, p_days));
  return v_id;
end $$;

-- Ends a campaign early and refunds whole unused days.
create or replace function public._end_campaign(p_id uuid, p_status public.campaign_status, p_note text)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.promotion_campaigns%rowtype; v_days integer; v_refund integer;
begin
  select * into c from public.promotion_campaigns where id = p_id for update;
  if not found then raise exception 'Promotion not found' using errcode = 'P0002'; end if;
  if c.status not in ('active', 'paused') then raise exception 'This promotion has already ended' using errcode = '22023'; end if;
  v_days := greatest(0, least(c.days, floor(extract(epoch from (c.ends_at - now())) / 86400)::integer));
  v_refund := v_days * c.credits_per_day;
  update public.promotion_campaigns set status = p_status, status_note = p_note, credits_refunded = v_refund,
    ends_at = least(ends_at, now()), updated_at = now() where id = p_id;
  if v_refund > 0 then
    perform public._apply_credits(c.seller_id, v_refund, 'promotion_refund', 'campaign-refund:' || c.id, 'campaign', c.id::text,
      format('Refund for %s unused day(s)', v_days));
  end if;
  return v_refund;
end $$;
revoke execute on function public._end_campaign(uuid, public.campaign_status, text) from public, anon, authenticated;

create or replace function public.cancel_promotion(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.promotion_campaigns where id = p_id and seller_id = auth.uid()) then
    raise exception 'Promotion not found' using errcode = 'P0002';
  end if;
  return public._end_campaign(p_id, 'cancelled', 'Cancelled by seller');
end $$;

create or replace function public.expire_promotions()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.promotion_campaigns set status = 'ended', updated_at = now() where status in ('active', 'paused') and ends_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.expire_promotions() from public, anon, authenticated;

-- Which sponsored listings to show. Only live campaigns on visible listings; relevant to the search when one is given;
-- random rotation; capped by the platform setting max_sponsored_per_page.
create or replace function public.get_sponsored(p_placement public.promotion_placement, p_country char(2), p_category text default null,
  p_query text default null, p_limit integer default 2)
returns table (campaign_id uuid, listing_id uuid) language plpgsql stable security definer set search_path = public as $$
declare v_cap integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'max_sponsored_per_page'), 2);
begin
  return query
  select c.id, c.listing_id
  from public.promotion_campaigns c
  join public.listings l on l.id = c.listing_id
  left join public.categories cat on cat.id = l.category_id
  where c.placement = p_placement and c.country_code = p_country and c.status = 'active'
    and c.starts_at <= now() and c.ends_at > now()
    and l.status = 'active' and l.moderation_status = 'approved' and public.is_active_user(l.seller_id)
    and (auth.uid() is null or not public.is_blocked_between(auth.uid(), l.seller_id))
    and (p_category is null or cat.slug = p_category or exists (select 1 from public.categories s where s.id = l.subcategory_id and s.slug = p_category))
    and (p_query is null or p_query = '' or l.search_vector @@ websearch_to_tsquery('simple', p_query) or l.title ilike '%' || p_query || '%')
  order by random()
  limit least(greatest(coalesce(p_limit, 2), 0), v_cap);
end $$;
grant execute on function public.get_sponsored(public.promotion_placement, char, text, text, integer) to anon, authenticated;

-- Server-only (service role): the route handler derives viewer_key from the session or an anonymous cookie.
-- Counts each viewer at most once per campaign, kind and day. The seller's own views are not counted.
create or replace function public.record_promotion_event(p_campaign uuid, p_kind text, p_viewer_key text, p_viewer uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.promotion_campaigns%rowtype; v_rows integer;
begin
  select * into c from public.promotion_campaigns where id = p_campaign;
  if not found or c.status <> 'active' or c.ends_at <= now() then return false; end if;
  if p_viewer is not null and p_viewer = c.seller_id then return false; end if;
  insert into public.promotion_events(campaign_id, kind, viewer_key) values (p_campaign, p_kind, p_viewer_key) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;
  if p_kind = 'impression' then
    update public.promotion_campaigns set impressions = impressions + 1 where id = p_campaign;
  else
    update public.promotion_campaigns set clicks = clicks + 1 where id = p_campaign;
  end if;
  return true;
end $$;
revoke execute on function public.record_promotion_event(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_promotion_event(uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_package(p_id uuid, p_country char(2), p_name text, p_credits integer, p_price_minor bigint, p_active boolean, p_sort integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_currency char(3);
begin
  perform public._require_admin();
  select currency_code into v_currency from public.countries where code = p_country;
  if p_id is null then
    insert into public.credit_packages(country_code, name, credits, price_minor, currency, is_active, sort_order)
    values (p_country, p_name, p_credits, p_price_minor, v_currency, p_active, coalesce(p_sort, 0)) returning id into v_id;
  else
    update public.credit_packages set name = p_name, credits = p_credits, price_minor = p_price_minor, is_active = p_active, sort_order = coalesce(p_sort, 0)
    where id = p_id returning id into v_id;
  end if;
  perform public._audit('package.upsert', 'credit_package', v_id::text, jsonb_build_object('country', p_country, 'name', p_name, 'credits', p_credits, 'price_minor', p_price_minor, 'active', p_active));
  return v_id;
end $$;

create or replace function public.admin_upsert_plan(p_id uuid, p_country char(2), p_code text, p_name text, p_description text, p_price_minor bigint,
  p_period_days integer, p_listing_limit integer, p_monthly_credits integer, p_active boolean, p_sort integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_currency char(3);
begin
  perform public._require_admin();
  select currency_code into v_currency from public.countries where code = p_country;
  if p_id is null then
    insert into public.subscription_plans(country_code, code, name, description, price_minor, currency, period_days, active_listing_limit, monthly_credits, is_active, sort_order)
    values (p_country, p_code, p_name, p_description, p_price_minor, v_currency, p_period_days, p_listing_limit, p_monthly_credits, p_active, coalesce(p_sort, 0))
    returning id into v_id;
  else
    -- Price changes apply to new purchases and renewals; existing paid periods are honoured.
    update public.subscription_plans set name = p_name, description = p_description, price_minor = p_price_minor, period_days = p_period_days,
      active_listing_limit = p_listing_limit, monthly_credits = p_monthly_credits, is_active = p_active, sort_order = coalesce(p_sort, 0)
    where id = p_id returning id into v_id;
  end if;
  perform public._audit('plan.upsert', 'subscription_plan', v_id::text, jsonb_build_object('country', p_country, 'code', p_code, 'price_minor', p_price_minor, 'active', p_active));
  return v_id;
end $$;

create or replace function public.admin_set_promotion_price(p_country char(2), p_placement public.promotion_placement, p_credits_per_day integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  insert into public.promotion_prices(country_code, placement, credits_per_day) values (p_country, p_placement, p_credits_per_day)
  on conflict (country_code, placement) do update set credits_per_day = excluded.credits_per_day, updated_at = now();
  perform public._audit('promotion_price.set', 'country', p_country, jsonb_build_object('placement', p_placement, 'credits_per_day', p_credits_per_day));
end $$;

-- Manual adjustment (goodwill, correction). p_request_id makes a double-submitted form harmless.
create or replace function public.admin_adjust_credits(p_user uuid, p_delta integer, p_reason text, p_request_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_tx bigint;
begin
  perform public._require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if p_delta = 0 or abs(p_delta) > 100000 then raise exception 'Adjustment must be between 1 and 100000 credits' using errcode = '22023'; end if;
  v_tx := public._apply_credits(p_user, p_delta, case when p_delta > 0 then 'admin_grant'::public.credit_tx_kind else 'admin_debit' end,
    'admin:' || p_request_id, 'admin', auth.uid()::text, p_reason, auth.uid());
  perform public._audit(case when p_delta > 0 then 'credits.grant' else 'credits.debit' end, 'user', p_user::text, jsonb_build_object('delta', p_delta, 'reason', p_reason, 'tx', v_tx));
  return v_tx;
end $$;

create or replace function public.admin_set_campaign_status(p_id uuid, p_status public.campaign_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.promotion_campaigns%rowtype;
begin
  perform public._require_staff();
  select * into c from public.promotion_campaigns where id = p_id;
  if not found then raise exception 'Promotion not found' using errcode = 'P0002'; end if;
  if p_status = 'removed' then
    perform public._end_campaign(p_id, 'removed', p_note);
    perform public.notify(c.seller_id, 'moderation', 'A promotion was stopped', p_note, '/dashboard/promotions', '{}');
  elsif p_status in ('paused', 'active') and c.status in ('active', 'paused') then
    update public.promotion_campaigns set status = p_status, status_note = p_note, updated_at = now() where id = p_id;
  else
    raise exception 'That change is not allowed' using errcode = '22023';
  end if;
  perform public._audit('campaign.' || p_status, 'campaign', p_id::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_revenue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'by_currency', (select coalesce(jsonb_agg(x), '[]') from (
        select currency, purpose, count(*) as payments, sum(amount_minor) as amount_minor
        from public.platform_payments where status = 'succeeded' group by currency, purpose order by currency, purpose) x),
    'last_30_days', (select coalesce(jsonb_agg(x), '[]') from (
        select currency, count(*) as payments, sum(amount_minor) as amount_minor
        from public.platform_payments where status = 'succeeded' and completed_at > now() - interval '30 days' group by currency) x),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.platform_payments group by status) x),
    'credits_outstanding', (select coalesce(sum(balance), 0) from public.credit_accounts),
    'credits_spent', (select coalesce(-sum(delta), 0) from public.credit_transactions where kind = 'promotion_spend'),
    'active_campaigns', (select count(*) from public.promotion_campaigns where status = 'active' and ends_at > now()),
    'active_subscriptions', (select count(*) from public.subscriptions where status = 'active' and current_period_end > now()),
    'ledger_mismatches', (select count(*) from public.credit_ledger_mismatches())
  );
end $$;

-- Reconciliation: every cached balance must equal the sum of its ledger rows.
create or replace function public.credit_ledger_mismatches()
returns table (user_id uuid, balance bigint, ledger_sum bigint) language sql stable security definer set search_path = public as $$
  select a.user_id, a.balance, coalesce(sum(t.delta), 0)::bigint
  from public.credit_accounts a left join public.credit_transactions t on t.user_id = a.user_id
  group by a.user_id, a.balance
  having a.balance <> coalesce(sum(t.delta), 0);
$$;
revoke execute on function public.credit_ledger_mismatches() from public, anon, authenticated;

-- Scheduled maintenance now also ends promotions and plans.
create or replace function public.purge_expired_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare a int; b int; c int;
begin
  delete from public.notifications where read_at is not null and created_at < now() - interval '180 days'; get diagnostics a = row_count;
  delete from public.listing_view_events where day < current_date - 90; get diagnostics b = row_count;
  update public.listings set status = 'expired' where status = 'active' and expires_at < now(); get diagnostics c = row_count;
  perform public.expire_offers();
  delete from public.promotion_events where day < current_date - 400;
  return jsonb_build_object('notifications', a, 'view_events', b, 'expired_listings', c,
    'ended_promotions', public.expire_promotions(), 'expired_subscriptions', public.expire_subscriptions());
end $$;
revoke execute on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.credit_packages enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.promotion_prices enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.platform_payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.promotion_campaigns enable row level security;
alter table public.promotion_events enable row level security;

create policy packages_read on public.credit_packages for select using (is_active or public.is_admin());
create policy plans_read on public.subscription_plans for select using (is_active or public.is_admin());
create policy promotion_prices_read on public.promotion_prices for select using (true);
create policy credit_accounts_own on public.credit_accounts for select using (user_id = auth.uid() or public.is_admin());
create policy credit_tx_own on public.credit_transactions for select using (user_id = auth.uid() or public.is_admin());
create policy subscriptions_own on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
create policy payments_own on public.platform_payments for select using (user_id = auth.uid() or public.is_admin());
create policy payment_events_admin on public.payment_events for select using (public.is_admin());
create policy campaigns_own on public.promotion_campaigns for select using (seller_id = auth.uid() or public.is_staff());

-- No direct writes from clients: everything goes through the functions above.
revoke insert, update, delete, truncate on public.credit_packages, public.subscription_plans, public.promotion_prices, public.credit_accounts,
  public.credit_transactions, public.subscriptions, public.platform_payments, public.payment_events, public.promotion_campaigns,
  public.promotion_events from anon, authenticated;

grant execute on function public.my_credit_balance(), public.start_checkout(public.payment_purpose, uuid), public.cancel_my_subscription(boolean),
  public.create_promotion(uuid, public.promotion_placement, integer), public.cancel_promotion(uuid),
  public.admin_upsert_package(uuid, char, text, integer, bigint, boolean, integer),
  public.admin_upsert_plan(uuid, char, text, text, text, bigint, integer, integer, integer, boolean, integer),
  public.admin_set_promotion_price(char, public.promotion_placement, integer), public.admin_adjust_credits(uuid, integer, text, uuid),
  public.admin_set_campaign_status(uuid, public.campaign_status, text), public.admin_revenue() to authenticated;
revoke execute on function public.my_credit_balance(), public.start_checkout(public.payment_purpose, uuid), public.cancel_my_subscription(boolean),
  public.create_promotion(uuid, public.promotion_placement, integer), public.cancel_promotion(uuid),
  public.admin_upsert_package(uuid, char, text, integer, bigint, boolean, integer),
  public.admin_upsert_plan(uuid, char, text, text, text, bigint, integer, integer, integer, boolean, integer),
  public.admin_set_promotion_price(char, public.promotion_placement, integer), public.admin_adjust_credits(uuid, integer, text, uuid),
  public.admin_set_campaign_status(uuid, public.campaign_status, text), public.admin_revenue() from anon;

-- ---------------------------------------------------------------------------
-- Starting catalogue. PLACEHOLDER PRICES for development: an administrator must review and set real prices
-- (Admin > Credits & packages, Subscription plans) before any market takes real payments.
-- ---------------------------------------------------------------------------
insert into public.credit_packages(country_code, name, credits, price_minor, currency, sort_order) values
  ('NG', 'Starter', 50, 250000, 'NGN', 1), ('NG', 'Standard', 120, 500000, 'NGN', 2), ('NG', 'Pro', 300, 1100000, 'NGN', 3),
  ('GH', 'Starter', 50, 3000, 'GHS', 1), ('GH', 'Standard', 120, 6000, 'GHS', 2), ('GH', 'Pro', 300, 13500, 'GHS', 3),
  ('KE', 'Starter', 50, 25000, 'KES', 1), ('KE', 'Standard', 120, 50000, 'KES', 2),
  ('ZA', 'Starter', 50, 3500, 'ZAR', 1), ('ZA', 'Standard', 120, 7000, 'ZAR', 2);

insert into public.subscription_plans(country_code, code, name, description, price_minor, currency, active_listing_limit, monthly_credits, sort_order) values
  ('NG', 'trader-plus', 'Trader Plus', 'Up to 200 active listings and 40 promotion credits each period.', 300000, 'NGN', 200, 40, 1),
  ('NG', 'business-pro', 'Business Pro', 'Up to 1,000 active listings and 150 promotion credits each period.', 900000, 'NGN', 1000, 150, 2),
  ('GH', 'trader-plus', 'Trader Plus', 'Up to 200 active listings and 40 promotion credits each period.', 3500, 'GHS', 200, 40, 1),
  ('GH', 'business-pro', 'Business Pro', 'Up to 1,000 active listings and 150 promotion credits each period.', 10500, 'GHS', 1000, 150, 2);

insert into public.promotion_prices(country_code, placement, credits_per_day) values
  ('NG', 'search', 10), ('NG', 'homepage', 25), ('NG', 'category', 8),
  ('GH', 'search', 10), ('GH', 'homepage', 25), ('GH', 'category', 8),
  ('KE', 'search', 10), ('KE', 'homepage', 25), ('KE', 'category', 8),
  ('ZA', 'search', 10), ('ZA', 'homepage', 25), ('ZA', 'category', 8);
