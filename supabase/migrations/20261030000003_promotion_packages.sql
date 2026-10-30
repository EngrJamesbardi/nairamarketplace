-- Paid listing promotion packages (e.g. "Promote for 7 days - NGN 2,000"), offered as an optional last step when a seller
-- publishes a listing, and from the Promotions page for any live listing.
--
-- Rules:
--  * Packages are per market and priced in that market's currency (catalogue_currency_check). Nigeria gets the starting
--    packages below; no other market gets any until an administrator adds them in its own currency.
--  * Choosing a package creates a pending platform_payments row only. The promotion is created by complete_payment(),
--    which only the service role can call after the server has verified the provider's webhook signature. A browser
--    redirect, a forged return URL or a duplicate webhook never activates or extends anything.
--  * A paid promotion is a promotion_campaigns row with payment_id set and no credits. It ends automatically at ends_at:
--    get_sponsored() never serves it after that, and expire_promotions() (maintenance cron) marks it ended.
--  * Credit-funded promotions keep working exactly as before.

create table public.promotion_packages (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.countries(code),
  code text not null check (code ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 300),
  days integer not null check (days between 1 and 90),
  price_minor bigint not null check (price_minor > 0),
  currency char(3) not null,
  placements public.promotion_placement[] not null default array['search', 'homepage', 'category']::public.promotion_placement[]
    check (cardinality(placements) between 1 and 3),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, code)
);
create trigger promotion_packages_currency before insert or update on public.promotion_packages
  for each row execute function public.catalogue_currency_check();

alter table public.promotion_packages enable row level security;
create policy promotion_packages_read on public.promotion_packages for select using (is_active or public.is_admin());
revoke insert, update, delete, truncate on public.promotion_packages from anon, authenticated;

-- Payments for a package record what was bought, for which listing, at which price and duration (a later price change
-- by an administrator never changes a payment already started).
alter table public.platform_payments
  add column promotion_package_id uuid references public.promotion_packages(id),
  add column listing_id uuid references public.listings(id) on delete set null,
  add column promotion_days integer check (promotion_days between 1 and 90);
alter table public.platform_payments drop constraint platform_payments_check;
alter table public.platform_payments add constraint platform_payments_purpose_check check (
  (purpose = 'credits' and package_id is not null and credits is not null)
  or (purpose = 'subscription' and plan_id is not null)
  or (purpose = 'promotion' and promotion_package_id is not null and promotion_days is not null));
create index platform_payments_listing_idx on public.platform_payments(listing_id) where listing_id is not null;

-- Campaigns funded by a payment instead of credits.
alter table public.promotion_campaigns
  add column payment_id uuid references public.platform_payments(id),
  add column package_id uuid references public.promotion_packages(id);
alter table public.promotion_campaigns drop constraint promotion_campaigns_days_check;
alter table public.promotion_campaigns drop constraint promotion_campaigns_credits_per_day_check;
alter table public.promotion_campaigns drop constraint promotion_campaigns_credits_charged_check;
alter table public.promotion_campaigns
  add constraint promotion_campaigns_days_check check (days between 1 and 366),
  add constraint promotion_campaigns_funding_check check (
    (payment_id is null and credits_per_day > 0 and credits_charged > 0)
    or (payment_id is not null and credits_per_day = 0 and credits_charged = 0));

-- One live credit campaign and one live paid campaign per listing and placement. Buying the same package again while
-- one is running extends it instead of stacking a duplicate.
drop index public.promotion_campaigns_one_live;
create unique index promotion_campaigns_one_live on public.promotion_campaigns(listing_id, placement)
  where status in ('active', 'paused') and payment_id is null;
create unique index promotion_campaigns_one_live_paid on public.promotion_campaigns(listing_id, placement)
  where status in ('active', 'paused') and payment_id is not null;

-- ---------------------------------------------------------------------------
-- Checkout
-- ---------------------------------------------------------------------------
create or replace function public.start_promotion_checkout(p_package uuid, p_listing uuid)
returns table (payment_id uuid, reference text, provider text, amount_minor bigint, currency char(3), description text)
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_pkg public.promotion_packages%rowtype;
  l public.listings%rowtype;
  v_country public.countries%rowtype;
  v_pay public.platform_payments%rowtype;
begin
  if v_me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not public.is_active_user(v_me) then raise exception 'Your account cannot make purchases right now' using errcode = '42501'; end if;
  select * into v_pkg from public.promotion_packages where id = p_package and is_active;
  if not found then raise exception 'That promotion package is not available' using errcode = 'P0002'; end if;
  select * into l from public.listings where id = p_listing;
  if not found or l.seller_id <> v_me then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  if l.country_code <> v_pkg.country_code then raise exception 'That package is not offered in this listing''s market' using errcode = '22023'; end if;
  if l.status <> 'active' or l.moderation_status in ('rejected', 'removed') then
    raise exception 'Publish the listing before promoting it' using errcode = '22023';
  end if;
  select * into v_country from public.countries where code = l.country_code;
  if not v_country.is_active then raise exception '% is not open yet', v_country.name using errcode = '22023'; end if;
  if v_country.payment_provider is null or v_country.payment_provider = '' then
    raise exception 'Payments are not available in % yet', v_country.name using errcode = '22023';
  end if;

  -- A double tap or a retry resumes the same unpaid checkout instead of creating another one.
  select * into v_pay from public.platform_payments p
  where p.user_id = v_me and p.purpose = 'promotion' and p.listing_id = p_listing and p.promotion_package_id = p_package
    and p.status = 'pending' and p.provider = v_country.payment_provider and p.amount_minor = v_pkg.price_minor
    and p.created_at > now() - interval '30 minutes'
  order by p.created_at desc limit 1;
  if not found then
    perform public.assert_rate((select count(*) from public.platform_payments where user_id = v_me and created_at > now() - interval '1 hour'), 10, 'checkout attempts');
    insert into public.platform_payments(user_id, provider, purpose, promotion_package_id, listing_id, promotion_days, country_code, amount_minor, currency)
    values (v_me, v_country.payment_provider, 'promotion', v_pkg.id, l.id, v_pkg.days, l.country_code, v_pkg.price_minor, v_pkg.currency)
    returning * into v_pay;
  end if;
  return query select v_pay.id, v_pay.reference, v_pay.provider, v_pay.amount_minor, v_pay.currency,
    format('%s: "%s"', v_pkg.name, left(l.title, 60));
end $$;
revoke execute on function public.start_promotion_checkout(uuid, uuid) from public, anon;
grant execute on function public.start_promotion_checkout(uuid, uuid) to authenticated;

-- Activates (or extends) the paid promotion for a verified payment. Internal: called by complete_payment() only.
create or replace function public._activate_paid_promotion(p_payment uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v public.platform_payments%rowtype;
  v_pkg public.promotion_packages%rowtype;
  l public.listings%rowtype;
  v_pl public.promotion_placement;
  v_live public.promotion_campaigns%rowtype;
  n integer := 0;
begin
  select * into v from public.platform_payments where id = p_payment;
  select * into v_pkg from public.promotion_packages where id = v.promotion_package_id;
  select * into l from public.listings where id = v.listing_id;
  if not found then
    -- The listing was deleted between checkout and confirmation: keep the payment for a manual refund.
    perform public._audit('promotion.listing_missing', 'payment', v.id::text, jsonb_build_object('reference', v.reference));
    perform public.notify(v.user_id, 'payment', 'Payment received, listing not found',
      'We received your promotion payment but the listing no longer exists. Contact support for a refund (ref ' || v.reference || ').', '/dashboard/promotions', '{}');
    return 0;
  end if;
  foreach v_pl in array v_pkg.placements loop
    select * into v_live from public.promotion_campaigns
      where listing_id = l.id and placement = v_pl and payment_id is not null and status in ('active', 'paused') for update;
    if found then
      update public.promotion_campaigns
        set ends_at = greatest(ends_at, now()) + make_interval(days => v.promotion_days),
            days = days + v.promotion_days, payment_id = v.id, package_id = v_pkg.id, updated_at = now(),
            status_note = coalesce(status_note || ' ', '') || format('Extended by %s days (ref %s).', v.promotion_days, v.reference)
        where id = v_live.id;
    else
      insert into public.promotion_campaigns(seller_id, listing_id, country_code, placement, category_id, days, credits_per_day, credits_charged,
        ends_at, payment_id, package_id)
      values (l.seller_id, l.id, l.country_code, v_pl, case when v_pl = 'category' then l.category_id end, v.promotion_days, 0, 0,
        now() + make_interval(days => v.promotion_days), v.id, v_pkg.id);
    end if;
    n := n + 1;
  end loop;
  perform public.notify(v.user_id, 'payment', 'Your promotion is live',
    format('"%s" is promoted for %s days.', left(l.title, 60), v.promotion_days), '/dashboard/promotions', '{}');
  return n;
end $$;
revoke execute on function public._activate_paid_promotion(uuid) from public, anon, authenticated;

-- Same as 20261029000009 plus the promotion branch.
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
  elsif v.purpose = 'promotion' then
    perform public._activate_paid_promotion(v.id);
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
revoke execute on function public.complete_payment(text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.complete_payment(text, text, bigint, text, text) to service_role;

-- Paid promotions were bought with money, not credits: a seller cannot stop one early for a credit refund.
create or replace function public.cancel_promotion(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.promotion_campaigns%rowtype;
begin
  select * into c from public.promotion_campaigns where id = p_id and seller_id = auth.uid();
  if not found then raise exception 'Promotion not found' using errcode = 'P0002'; end if;
  if c.payment_id is not null then
    raise exception 'Paid promotions run until their end date. Contact support if something is wrong.' using errcode = '22023';
  end if;
  return public._end_campaign(p_id, 'cancelled', 'Cancelled by seller');
end $$;

-- A listing with both a credit and a paid campaign in a placement is served at most once per page.
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
      and l.status = 'active' and l.moderation_status = 'approved' and public.is_active_user(l.seller_id)
      and (auth.uid() is null or not public.is_blocked_between(auth.uid(), l.seller_id))
      and (p_category is null or cat.slug = p_category or exists (select 1 from public.categories s where s.id = l.subcategory_id and s.slug = p_category))
      and (p_query is null or p_query = '' or l.search_vector @@ websearch_to_tsquery('simple', p_query) or l.title ilike '%' || p_query || '%')
    order by c.listing_id, random()
  ) x
  order by random()
  limit least(greatest(coalesce(p_limit, 2), 0), v_cap);
end $$;
grant execute on function public.get_sponsored(public.promotion_placement, char, text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_promotion_package(p_id uuid, p_country char(2), p_code text, p_name text, p_description text,
  p_days integer, p_price_minor bigint, p_placements public.promotion_placement[], p_active boolean, p_sort integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_currency char(3);
begin
  perform public._require_admin();
  select currency_code into v_currency from public.countries where code = p_country;
  if v_currency is null then raise exception 'Unknown market' using errcode = 'P0002'; end if;
  if p_placements is null or cardinality(p_placements) = 0 then raise exception 'Choose at least one placement' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.promotion_packages(country_code, code, name, description, days, price_minor, currency, placements, is_active, sort_order)
    values (p_country, p_code, p_name, nullif(p_description, ''), p_days, p_price_minor, v_currency, p_placements, p_active, coalesce(p_sort, 0))
    returning id into v_id;
  else
    -- New prices and durations apply to new checkouts; payments already started keep the price and days they recorded.
    update public.promotion_packages set name = p_name, description = nullif(p_description, ''), days = p_days, price_minor = p_price_minor,
      placements = p_placements, is_active = p_active, sort_order = coalesce(p_sort, 0)
    where id = p_id and country_code = p_country returning id into v_id;
    if v_id is null then raise exception 'Package not found' using errcode = 'P0002'; end if;
  end if;
  perform public._audit('promotion_package.upsert', 'promotion_package', v_id::text, jsonb_build_object('country', p_country, 'code', p_code,
    'days', p_days, 'price_minor', p_price_minor, 'placements', p_placements, 'active', p_active));
  return v_id;
end $$;
revoke execute on function public.admin_upsert_promotion_package(uuid, char, text, text, text, integer, bigint, public.promotion_placement[], boolean, integer) from public, anon;
grant execute on function public.admin_upsert_promotion_package(uuid, char, text, text, text, integer, bigint, public.promotion_placement[], boolean, integer) to authenticated;

-- Staff can stop a paid promotion (e.g. it breaks the rules). Money refunds go through the payment provider, so this
-- only ends the campaign and records why; the seller is notified.
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
  perform public._audit('campaign.' || p_status, 'campaign', p_id::text, jsonb_build_object('note', p_note, 'paid', c.payment_id is not null));
end $$;

-- Revenue summary gains paid promotions.
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
    'active_paid_promotions', (select count(distinct listing_id) from public.promotion_campaigns where payment_id is not null and status = 'active' and ends_at > now()),
    'active_subscriptions', (select count(*) from public.subscriptions where status = 'active' and current_period_end > now()),
    'ledger_mismatches', (select count(*) from public.credit_ledger_mismatches())
  );
end $$;

-- ---------------------------------------------------------------------------
-- Starting packages: Nigeria only, in naira. Editable under Admin > Promotion packages.
-- ---------------------------------------------------------------------------
insert into public.promotion_packages(country_code, code, name, description, days, price_minor, currency, sort_order) values
  ('NG', 'promote-7', 'Promote for 7 days', 'Sponsored slot on the homepage, in matching searches and in its category for 7 days.', 7, 200000, 'NGN', 1),
  ('NG', 'promote-30', 'Promote for 30 days', 'Sponsored slot on the homepage, in matching searches and in its category for 30 days.', 30, 500000, 'NGN', 2);
