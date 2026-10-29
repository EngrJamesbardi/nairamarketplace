-- Row-level security for core tables. Every table has RLS enabled; the anon/authenticated roles
-- only get what the policies allow. Privileged writes go through SECURITY DEFINER functions that
-- re-check authorisation and write audit logs.

alter table public.countries enable row level security;
alter table public.regions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.listing_view_events enable row level security;
alter table public.prohibited_terms enable row level security;
alter table public.country_policies enable row level security;
alter table public.platform_settings enable row level security;

-- Countries / regions / categories / policies / settings: public read, staff write (via admin RPCs).
create policy countries_read on public.countries for select using (true);
create policy regions_read on public.regions for select using (true);
create policy categories_read on public.categories for select using (is_active or public.is_staff());
create policy country_policies_read on public.country_policies for select using (true);
create policy platform_settings_read on public.platform_settings for select using (true);
create policy prohibited_terms_staff on public.prohibited_terms for select using (public.is_staff());

-- Profiles: public profile fields are readable (sensitive fields are exposed only via the public_profiles view);
-- users update only their own row (protected columns enforced by trigger).
create policy profiles_read_self on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Public projection of profiles (no phone, prefs, moderation fields).
create view public.public_profiles with (security_barrier = true) as
  select id, display_name, avatar_url, bio, country_code, city, created_at, status
  from public.profiles
  where status in ('active', 'suspended');
grant select on public.public_profiles to anon, authenticated;

-- Roles: users can see their own roles; nobody but trusted server code / admin RPCs can write.
create policy user_roles_read_self on public.user_roles for select using (user_id = auth.uid() or public.is_admin());

-- Seller profiles: public read for active accounts; owner insert/update.
create policy seller_profiles_read on public.seller_profiles for select
  using (public.is_active_user(user_id) or user_id = auth.uid() or public.is_staff());
create policy seller_profiles_insert on public.seller_profiles for insert
  with check (user_id = auth.uid() and public.is_active_user(auth.uid()));
create policy seller_profiles_update on public.seller_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Listings: public sees active + approved listings from active sellers (and sold/reserved for context);
-- owners see all of their own; staff see all.
create policy listings_public_read on public.listings for select using (
  (status in ('active', 'reserved', 'sold') and moderation_status = 'approved' and public.is_active_user(seller_id))
  or seller_id = auth.uid()
  or public.is_staff()
);
create policy listings_owner_insert on public.listings for insert
  with check (seller_id = auth.uid());
create policy listings_owner_update on public.listings for update
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
-- No delete policy: listings are archived, not hard-deleted, by sellers.

create policy listing_images_read on public.listing_images for select using (
  exists (select 1 from public.listings l where l.id = listing_id)  -- inherits listing visibility
);
create policy listing_images_owner_write on public.listing_images for insert
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
create policy listing_images_owner_update on public.listing_images for update
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
create policy listing_images_owner_delete on public.listing_images for delete
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));

-- listing_view_events: no direct access (written via record_listing_view()).

-- Column privileges: belt-and-braces on top of triggers.
revoke update (status, suspended_reason, suspended_until, phone_verified_at, is_seed) on public.profiles from authenticated, anon;
grant update (status) on public.profiles to authenticated; -- deactivate/reactivate only; trigger restricts transitions
revoke insert, update, delete on public.user_roles from authenticated, anon;
revoke insert, update, delete on public.countries, public.regions, public.categories, public.prohibited_terms,
  public.country_policies, public.platform_settings from authenticated, anon;

-- Listing cards: denormalised read model used across discovery surfaces (respects RLS of base tables).
create view public.listing_cards with (security_invoker = true) as
  select
    l.id, l.seller_id, l.country_code, l.region_id, r.name as region_name, l.city,
    l.title, l.price_minor, l.currency, l.price_type, l.condition, l.status, l.moderation_status,
    l.quantity, l.category_id, c.slug as category_slug, l.published_at, l.created_at, l.view_count, l.favourite_count,
    l.is_seed, l.latitude, l.longitude,
    sp.shop_name, sp.slug as shop_slug, sp.verification_status as seller_verification,
    (select i.url from public.listing_images i where i.listing_id = l.id order by i.position limit 1) as image_url
  from public.listings l
  join public.categories c on c.id = l.category_id
  left join public.regions r on r.id = l.region_id
  left join public.seller_profiles sp on sp.user_id = l.seller_id;
grant select on public.listing_cards to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Database-backed search with pagination, filters and organic ranking.
-- Sponsored results are fetched separately and always labelled in the UI.
-- ---------------------------------------------------------------------------
create or replace function public.search_listings(
  p_query text default null,
  p_country char(2) default null,
  p_category text default null,         -- category slug (parent or child)
  p_region_id bigint default null,
  p_city text default null,
  p_min_price bigint default null,      -- minor units, in p_country's currency
  p_max_price bigint default null,
  p_conditions public.item_condition[] default null,
  p_negotiable_only boolean default false,
  p_seller_id uuid default null,
  p_include_unavailable boolean default false,
  p_near_lat numeric default null,
  p_near_lng numeric default null,
  p_max_km numeric default null,
  p_sort text default 'relevance',      -- relevance | newest | price_asc | price_desc | nearest
  p_limit integer default 24,
  p_offset integer default 0
)
returns setof public.listing_cards
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_tsq tsquery;
  v_q text := nullif(trim(p_query), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
  v_currency char(3);
begin
  if v_q is not null then
    v_q := left(v_q, 100);
    v_tsq := websearch_to_tsquery('simple', v_q);
  end if;
  if p_country is not null then
    select currency_code into v_currency from public.countries where code = p_country;
  end if;

  return query
  with cat as (
    select id from public.categories
    where p_category is not null and (slug = p_category or parent_id = (select id from public.categories where slug = p_category))
  ),
  base as (
    select lc.*,
      case when v_q is null then 0
           else ts_rank(l.search_vector, v_tsq) * 2 + similarity(l.title, v_q) end as text_score,
      case when p_near_lat is not null and lc.latitude is not null then
        6371 * 2 * asin(sqrt(power(sin(radians(lc.latitude - p_near_lat) / 2), 2) +
          cos(radians(p_near_lat)) * cos(radians(lc.latitude)) * power(sin(radians(lc.longitude - p_near_lng) / 2), 2)))
      end as km
    from public.listing_cards lc
    join public.listings l on l.id = lc.id
    where lc.moderation_status = 'approved'
      and (case when p_include_unavailable then lc.status in ('active','reserved','sold') else lc.status = 'active' end)
      and (p_country is null or lc.country_code = p_country)
      and (v_q is null or l.search_vector @@ v_tsq or l.title % v_q or l.title ilike '%' || v_q || '%')
      and (p_category is null or lc.category_id in (select id from cat) or l.subcategory_id in (select id from cat))
      and (p_region_id is null or lc.region_id = p_region_id)
      and (p_city is null or lc.city ilike p_city)
      -- Price filters only apply in the market's own currency (no conversion).
      and (p_min_price is null or (lc.currency = v_currency and lc.price_minor >= p_min_price))
      and (p_max_price is null or (lc.currency = v_currency and lc.price_minor <= p_max_price))
      and (p_conditions is null or lc.condition = any(p_conditions))
      and (not p_negotiable_only or lc.price_type = 'negotiable')
      and (p_seller_id is null or lc.seller_id = p_seller_id)
  )
  select b.id, b.seller_id, b.country_code, b.region_id, b.region_name, b.city, b.title, b.price_minor, b.currency,
         b.price_type, b.condition, b.status, b.moderation_status, b.quantity, b.category_id, b.category_slug,
         b.published_at, b.created_at, b.view_count, b.favourite_count, b.is_seed, b.latitude, b.longitude,
         b.shop_name, b.shop_slug, b.seller_verification, b.image_url
  from base b
  where (p_max_km is null or p_near_lat is null or (b.km is not null and b.km <= p_max_km))
  order by
    case when p_sort = 'price_asc' then b.price_minor end asc nulls last,
    case when p_sort = 'price_desc' then b.price_minor end desc nulls last,
    case when p_sort = 'nearest' then b.km end asc nulls last,
    case when p_sort = 'relevance' then
      -- organic score: text relevance + freshness decay + light engagement signal + image presence
      b.text_score
      + 1.0 / (1 + extract(epoch from (now() - coalesce(b.published_at, b.created_at))) / 86400 / 7)
      + ln(1 + b.favourite_count) * 0.15 + ln(1 + b.view_count) * 0.05
      + case when b.image_url is not null then 0.2 else 0 end
    end desc nulls last,
    b.published_at desc nulls last, b.id
  limit v_limit offset v_offset;
end $$;

grant execute on function public.search_listings to anon, authenticated;
grant execute on function public.record_listing_view(uuid, text) to anon, authenticated;
