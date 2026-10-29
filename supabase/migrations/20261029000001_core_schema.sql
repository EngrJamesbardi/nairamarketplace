-- Naira Marketplace: core schema (countries, profiles, sellers, categories, listings)
-- Money is always stored as integer minor units (bigint) next to an explicit ISO-4217 currency code.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'moderator');
create type public.account_status as enum ('active', 'suspended', 'deactivated', 'deleted');
create type public.seller_type as enum ('individual', 'trader', 'shop', 'wholesaler', 'business');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.price_type as enum ('fixed', 'negotiable', 'contact');
create type public.item_condition as enum ('new', 'like_new', 'used_good', 'used_fair', 'for_parts');
create type public.listing_status as enum ('draft', 'active', 'paused', 'reserved', 'sold', 'archived', 'expired');
create type public.moderation_status as enum ('approved', 'pending_review', 'rejected', 'removed');
create type public.delivery_option as enum ('local_pickup', 'buyer_collection', 'seller_dispatch', 'courier', 'other');

-- ---------------------------------------------------------------------------
-- Countries & regions (markets are activated by administrators)
-- ---------------------------------------------------------------------------
create table public.countries (
  code char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  currency_minor_units smallint not null default 2 check (currency_minor_units between 0 and 3),
  locale text not null,                       -- BCP-47 locale used for number/date formatting, e.g. en-NG
  default_language text not null default 'en',
  supported_languages text[] not null default array['en'],
  phone_prefix text not null,                 -- e.g. +234
  phone_pattern text not null,                -- regex for national significant number (no leading 0)
  region_label text not null default 'Region', -- State / Region / County / Province
  postal_code_label text,                     -- null when postcodes are not commonly used
  is_active boolean not null default false,
  allow_cross_border_discovery boolean not null default true,
  payment_provider text,                      -- provider key for platform-service payments, null = none configured
  free_active_listing_limit integer not null default 50 check (free_active_listing_limit >= 0),
  listing_duration_days integer not null default 60 check (listing_duration_days between 1 and 365),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.regions (
  id bigint generated always as identity primary key,
  country_code char(2) not null references public.countries(code) on update cascade,
  name text not null,
  kind text not null default 'state',
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean not null default true,
  unique (country_code, name)
);
create index regions_country_idx on public.regions(country_code);

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  country_code char(2) references public.countries(code),
  region_id bigint references public.regions(id),
  city text check (char_length(city) <= 80),
  phone text check (char_length(phone) <= 20),
  phone_verified_at timestamptz,
  preferred_language text not null default 'en',
  notification_prefs jsonb not null default '{"messages": true, "offers": true, "follows": true, "listing_updates": true, "marketing": false}'::jsonb,
  marketing_consent_at timestamptz,
  status public.account_status not null default 'active',
  suspended_reason text,
  suspended_until timestamptz,
  deactivated_at timestamptz,
  deletion_requested_at timestamptz,
  is_seed boolean not null default false,       -- development seed data marker; never true in production
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Role helpers. SECURITY DEFINER so RLS policies can call them without recursion.
create or replace function public.has_role(p_role public.app_role, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = p_user and role = p_role);
$$;

create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin', p_user);
$$;

create or replace function public.is_staff(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = p_user and role in ('admin','moderator'));
$$;

create or replace function public.is_active_user(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'active');
$$;

-- True for the service role / postgres (server-side trusted code paths).
create or replace function public.is_service()
returns boolean language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      or coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin');
$$;

-- ---------------------------------------------------------------------------
-- Seller storefronts
-- ---------------------------------------------------------------------------
create table public.seller_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  shop_name text not null check (char_length(shop_name) between 2 and 80),
  slug extensions.citext not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  seller_type public.seller_type not null default 'individual',
  description text check (char_length(description) <= 1000),
  logo_url text,
  banner_url text,
  country_code char(2) not null references public.countries(code),
  region_id bigint references public.regions(id),
  city text check (char_length(city) <= 80),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (char_length(contact_phone) <= 20),
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{6,14}$'),
  show_whatsapp boolean not null default false,
  business_name text check (char_length(business_name) <= 120),
  business_registration_number text check (char_length(business_registration_number) <= 60),
  business_hours jsonb,
  delivery_options public.delivery_option[] not null default array['local_pickup']::public.delivery_option[],
  delivery_notes text check (char_length(delivery_notes) <= 500),
  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,
  is_featured boolean not null default false,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seller_profiles_country_idx on public.seller_profiles(country_code);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id bigint generated always as identity primary key,
  parent_id bigint references public.categories(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  icon text,                         -- lucide icon name
  attribute_schema jsonb not null default '[]'::jsonb, -- optional category-specific attribute definitions
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index categories_parent_idx on public.categories(parent_id);

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  country_code char(2) not null references public.countries(code),
  region_id bigint references public.regions(id),
  city text check (char_length(city) <= 80),
  latitude numeric(9,6),
  longitude numeric(9,6),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 5000),
  category_id bigint not null references public.categories(id),
  subcategory_id bigint references public.categories(id),
  price_minor bigint check (price_minor is null or price_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  price_type public.price_type not null default 'fixed',
  condition public.item_condition not null,
  quantity integer not null default 1 check (quantity between 0 and 100000),
  delivery_options public.delivery_option[] not null default array['local_pickup']::public.delivery_option[],
  delivery_notes text check (char_length(delivery_notes) <= 500),
  attributes jsonb not null default '{}'::jsonb,
  status public.listing_status not null default 'active',
  moderation_status public.moderation_status not null default 'approved',
  moderation_note text,
  sold_to uuid references public.profiles(id) on delete set null,
  sold_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  view_count integer not null default 0,
  favourite_count integer not null default 0,
  message_count integer not null default 0,
  is_seed boolean not null default false,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_price_required check (price_type = 'contact' or price_minor is not null)
);
create index listings_search_idx on public.listings using gin (search_vector);
create index listings_title_trgm_idx on public.listings using gin (title extensions.gin_trgm_ops);
create index listings_discovery_idx on public.listings (country_code, status, moderation_status, published_at desc);
create index listings_category_idx on public.listings (category_id, country_code, published_at desc);
create index listings_seller_idx on public.listings (seller_id, status);
create index listings_price_idx on public.listings (country_code, currency, price_minor);
create index listings_region_idx on public.listings (region_id);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,
  url text not null,
  width integer,
  height integer,
  position smallint not null default 0 check (position between 0 and 11),
  alt_text text check (char_length(alt_text) <= 200),
  created_at timestamptz not null default now()
);
create index listing_images_listing_idx on public.listing_images(listing_id, position);

-- One row per (listing, viewer, day) so view counts are de-duplicated rather than inflated.
create table public.listing_view_events (
  listing_id uuid not null references public.listings(id) on delete cascade,
  viewer_key text not null,
  day date not null default current_date,
  primary key (listing_id, viewer_key, day)
);

-- ---------------------------------------------------------------------------
-- Generic timestamps
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger countries_touch before update on public.countries for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger seller_profiles_touch before update on public.seller_profiles for each row execute function public.touch_updated_at();
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- New auth user -> profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_country char(2);
begin
  v_country := upper(nullif(new.raw_user_meta_data ->> 'country_code', ''));
  if v_country is not null and not exists (select 1 from public.countries where code = v_country) then
    v_country := null;
  end if;
  insert into public.profiles (id, display_name, country_code)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Member'), 80),
    v_country
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Protected columns: ordinary users cannot change moderation/admin-controlled fields.
-- ---------------------------------------------------------------------------
-- NOTE: these triggers are SECURITY INVOKER on purpose so is_service() sees the real caller role.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then
    return new;
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'active' and new.status = 'deactivated')
     and not (old.status = 'deactivated' and new.status = 'active') then
    raise exception 'Not allowed to change account status' using errcode = '42501';
  end if;
  if new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_until is distinct from old.suspended_until
     or new.phone_verified_at is distinct from old.phone_verified_at
     or new.is_seed is distinct from old.is_seed
     or new.id is distinct from old.id then
    raise exception 'Not allowed to change protected profile fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile_columns();

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
  if new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.is_featured is distinct from old.is_featured
     or new.is_seed is distinct from old.is_seed then
    raise exception 'Verification and featuring are controlled by administrators' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger seller_profiles_protect before insert or update on public.seller_profiles for each row execute function public.protect_seller_columns();
