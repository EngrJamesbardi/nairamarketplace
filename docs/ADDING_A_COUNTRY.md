# Adding or opening a market

Markets are data, not code. Kenya (KES) and South Africa (ZAR) are already configured but inactive.

## Open an existing configured market (KE, ZA)

1. Have the market's legal texts reviewed: terms addendum, privacy addendum and prohibited items. Add them in Admin > Policies &
   settings for that country.
2. Add country-specific prohibited or restricted terms in Admin > Policies.
3. Review the regions list (Kenya: counties; South Africa: provinces). Second-level areas (like Nigeria's LGAs) are optional: see
   "Second-level areas" below.
4. Credit packages and plans:
   - Kenya has placeholder packages and no plans yet.
   - South Africa has placeholder packages and no plans yet.
   - Set real prices in Admin > Credits & packages and Admin > Subscription plans.
   - Paid listing promotions: add packages in that market's currency in Admin > Promotion packages. Markets without packages only offer
     the free standard listing (naira packages are never applied to other markets).
5. In Admin > Countries, set:
   - the free active-listing limit
   - the listing duration
   - the payment provider (only after it is configured and tested)
   - whether the market is discoverable from abroad
6. Tick **Active**. The market then appears in the country selector and accepts new listings.

## Add a new country

Write a new migration (for example `supabase/migrations/<timestamp>_add_ug.sql`):

```sql
insert into public.countries (code, name, currency_code, currency_minor_units, locale, phone_prefix, phone_pattern, region_label, is_active, payment_provider)
values ('UG', 'Uganda', 'UGX', 0, 'en-UG', '+256', '^[37]\d{8}$', 'Region', false, null);

insert into public.regions (country_code, name, latitude, longitude) values
  ('UG', 'Central', 0.35, 32.58), ('UG', 'Eastern', 1.08, 34.18);   -- approximate centroids for distance search

insert into public.promotion_prices (country_code, placement, credits_per_day) values
  ('UG', 'search', 10), ('UG', 'homepage', 25), ('UG', 'category', 8);
```

Things to check:

- `currency_minor_units`: use 0 for currencies without subunits in practice (for example UGX). Prices are stored in minor units of that
  currency.
- `phone_pattern` matches the national significant number without the leading 0. `normalisePhone()` stores numbers in E.164 format.
- The country flag is derived from the ISO code automatically.

## Second-level areas (LGAs, districts)

Nigeria has all 774 LGAs in `public.areas` (source: `supabase/data/ng-locations.json`, generated into the locations migration by
`scripts/generate-locations-sql.mjs`). To add districts for another market, insert rows into `public.areas` (each `region_id` must be a
region of the same country) and set `countries.area_label` (for example `'District'`). The listing form, homepage and search then show
the dependent select for that market automatically, and the database rejects an area that is not in the chosen region. Leave
`area_label` null to keep the market on regions only (as Ghana, Kenya and South Africa are today).

Then run `npx supabase db push`, regenerate types (`npm run db:types`), and follow the "open" steps above.
