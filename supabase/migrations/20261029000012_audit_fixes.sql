-- Pre-launch audit fixes.
--
-- 1. Sellers could write published_at, expires_at, sold_to and sold_at directly through the API (the owner UPDATE
--    policy allows any column and the trigger did not protect these). That let a seller future-date a listing to the
--    top of relevance ranking, stop it from ever expiring, or mark any member as the buyer (making them eligible for a
--    "verified" review) without mark_listing_sold()'s checks. Renewing an already-active listing also cleared
--    expires_at, so it never expired. The trigger now owns these fields and renewal sets a fresh expiry date.
--
-- 2. client_request_id makes listing creation idempotent: the form sends a per-form id, so a double tap or a retry
--    after a lost redirect updates the same listing instead of creating a duplicate.

-- SECURITY INVOKER so is_service()/is_staff() reflect the real caller.
create or replace function public.listing_before_write()
returns trigger language plpgsql set search_path = public as $$
declare
  v_country public.countries%rowtype;
  v_term record;
  v_active_count integer;
  v_trusted boolean := public.is_service() or public.is_staff();
  v_renew boolean := false;
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
      new.published_at := null; new.expires_at := null;  -- set by the lifecycle rules below
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
      -- Lifecycle fields are server-managed: a seller cannot backdate or future-date a listing to game ranking,
      -- keep it from expiring, or name a buyer without mark_listing_sold()'s checks. renew_listing() asks for a
      -- renewal by clearing expires_at on an active listing.
      v_renew := new.status = 'active' and old.status = 'active' and new.expires_at is null;
      new.published_at := old.published_at;
      new.expires_at := old.expires_at;
      new.sold_to := old.sold_to;
      new.sold_at := old.sold_at;
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
  elsif v_renew then
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

alter table public.listings add column client_request_id uuid;
create unique index listings_client_request_idx on public.listings(seller_id, client_request_id) where client_request_id is not null;

-- Active listings left without an expiry date by the old renewal path get a fresh one.
update public.listings l set expires_at = now() + make_interval(days => c.listing_duration_days)
from public.countries c
where c.code = l.country_code and l.status = 'active' and l.expires_at is null;
