-- Storage buckets for listing images and avatars/logos, plus reference data (markets, categories).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-images', 'listing-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Users may only write inside a folder named after their own user id: <uid>/<file>
create policy "listing images public read" on storage.objects for select
  using (bucket_id in ('listing-images', 'avatars'));
create policy "users upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('listing-images', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text
              and public.is_active_user(auth.uid()));
create policy "users update own objects" on storage.objects for update to authenticated
  using (bucket_id in ('listing-images', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own objects" on storage.objects for delete to authenticated
  using (bucket_id in ('listing-images', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Reference data. Only Nigeria is active at launch; others are configured but await activation
-- by an administrator once operational, legal and payment requirements are ready.
-- ---------------------------------------------------------------------------
insert into public.countries
  (code, name, currency_code, currency_minor_units, locale, phone_prefix, phone_pattern, region_label, postal_code_label, is_active, payment_provider, sort_order)
values
  ('NG', 'Nigeria',      'NGN', 2, 'en-NG', '+234', '^[789][01][0-9]{8}$', 'State',    null,          true,  'mock', 1),
  ('GH', 'Ghana',        'GHS', 2, 'en-GH', '+233', '^[235][0-9]{8}$',     'Region',   null,          true,  'mock', 2),
  ('KE', 'Kenya',        'KES', 2, 'en-KE', '+254', '^[17][0-9]{8}$',      'County',   'Postal code', false, 'mock', 3),
  ('ZA', 'South Africa', 'ZAR', 2, 'en-ZA', '+27',  '^[6-8][0-9]{8}$',     'Province', 'Postal code', false, null,   4);

insert into public.regions (country_code, name, kind, latitude, longitude) values
  ('NG', 'Lagos', 'state', 6.524400, 3.379200),
  ('NG', 'Federal Capital Territory', 'territory', 9.076500, 7.398600),
  ('NG', 'Kano', 'state', 12.002200, 8.592000),
  ('NG', 'Rivers', 'state', 4.815600, 7.049800),
  ('NG', 'Oyo', 'state', 7.377500, 3.947000),
  ('NG', 'Kaduna', 'state', 10.510500, 7.416500),
  ('NG', 'Enugu', 'state', 6.524900, 7.517700),
  ('NG', 'Anambra', 'state', 6.210000, 7.070000),
  ('NG', 'Edo', 'state', 6.335000, 5.627500),
  ('NG', 'Ogun', 'state', 7.160000, 3.350000),
  ('GH', 'Greater Accra', 'region', 5.603700, -0.187000),
  ('GH', 'Ashanti', 'region', 6.688500, -1.624400),
  ('GH', 'Western', 'region', 4.896000, -1.755000),
  ('GH', 'Northern', 'region', 9.403400, -0.842400),
  ('KE', 'Nairobi', 'county', -1.292100, 36.821900),
  ('KE', 'Mombasa', 'county', -4.043500, 39.668200),
  ('KE', 'Kisumu', 'county', -0.091700, 34.768000),
  ('KE', 'Nakuru', 'county', -0.303100, 36.080000),
  ('ZA', 'Gauteng', 'province', -26.270800, 28.112300),
  ('ZA', 'Western Cape', 'province', -33.924900, 18.424100),
  ('ZA', 'KwaZulu-Natal', 'province', -29.858700, 31.021800),
  ('ZA', 'Eastern Cape', 'province', -32.296800, 26.419400);

insert into public.categories (slug, name, icon, sort_order) values
  ('phones-electronics', 'Phones & electronics', 'Smartphone', 1),
  ('fashion-accessories', 'Fashion & accessories', 'Shirt', 2),
  ('home-furniture', 'Home & furniture', 'Sofa', 3),
  ('appliances', 'Appliances', 'Refrigerator', 4),
  ('vehicles', 'Vehicles', 'Car', 5),
  ('beauty-personal-care', 'Beauty & personal care', 'Sparkles', 6),
  ('baby-children', 'Baby & children', 'Baby', 7),
  ('sports-leisure', 'Sports & leisure', 'Dumbbell', 8),
  ('food-groceries', 'Food & groceries', 'ShoppingBasket', 9),
  ('books-education', 'Books & education', 'BookOpen', 10),
  ('tools-equipment', 'Tools & equipment', 'Wrench', 11),
  ('other', 'Other permitted products', 'Package', 12);

insert into public.categories (parent_id, slug, name, sort_order)
select c.id, s.slug, s.name, s.ord from public.categories c
join (values
  ('phones-electronics', 'mobile-phones', 'Mobile phones', 1),
  ('phones-electronics', 'laptops-computers', 'Laptops & computers', 2),
  ('phones-electronics', 'tv-audio', 'TV & audio', 3),
  ('phones-electronics', 'phone-accessories', 'Phone accessories', 4),
  ('fashion-accessories', 'womens-clothing', 'Women''s clothing', 1),
  ('fashion-accessories', 'mens-clothing', 'Men''s clothing', 2),
  ('fashion-accessories', 'fabrics-textiles', 'Fabrics & textiles', 3),
  ('fashion-accessories', 'shoes-bags', 'Shoes & bags', 4),
  ('home-furniture', 'furniture', 'Furniture', 1),
  ('home-furniture', 'kitchenware', 'Kitchenware', 2),
  ('home-furniture', 'decor', 'Decor', 3),
  ('vehicles', 'cars', 'Cars', 1),
  ('vehicles', 'motorcycles', 'Motorcycles & tricycles', 2),
  ('vehicles', 'vehicle-parts', 'Vehicle parts', 3),
  ('food-groceries', 'fresh-produce', 'Fresh produce', 1),
  ('food-groceries', 'packaged-food', 'Packaged food', 2)
) as s(parent, slug, name, ord) on s.parent = c.slug;

update public.categories set attribute_schema = '[
  {"key":"make","label":"Make","type":"text"},
  {"key":"model","label":"Model","type":"text"},
  {"key":"year","label":"Year","type":"number","min":1950,"max":2100},
  {"key":"mileage_km","label":"Mileage (km)","type":"number","min":0},
  {"key":"transmission","label":"Transmission","type":"select","options":["Automatic","Manual"]}
]'::jsonb where slug = 'vehicles';
update public.categories set attribute_schema = '[
  {"key":"brand","label":"Brand","type":"text"},
  {"key":"model","label":"Model","type":"text"},
  {"key":"storage_gb","label":"Storage (GB)","type":"number","min":0}
]'::jsonb where slug = 'phones-electronics';
update public.categories set attribute_schema = '[
  {"key":"size","label":"Size","type":"text"},
  {"key":"colour","label":"Colour","type":"text"}
]'::jsonb where slug = 'fashion-accessories';

insert into public.platform_settings (key, value) values
  ('tagline', '"Africa''s Open Market. Your Deals, Your Way."'),
  ('positioning', '"Africa''s open marketplace for buying, selling and negotiating directly."'),
  ('max_sponsored_per_page', '2');

-- Global prohibited terms (examples; administrators maintain the real list per market with legal advice).
insert into public.prohibited_terms (country_code, term, action, reason) values
  (null, 'cocaine', 'block', 'Illegal drugs'),
  (null, 'heroin', 'block', 'Illegal drugs'),
  (null, 'firearm', 'review', 'Weapons require review'),
  (null, 'ammunition', 'block', 'Weapons'),
  (null, 'counterfeit', 'review', 'Possible counterfeit goods'),
  (null, 'replica', 'review', 'Possible counterfeit goods'),
  (null, 'ivory', 'block', 'Protected wildlife products'),
  (null, 'pangolin', 'block', 'Protected wildlife products'),
  ('NG', 'tramadol', 'block', 'Controlled medicine (NAFDAC)'),
  ('NG', 'codeine', 'review', 'Controlled medicine (NAFDAC)'),
  ('KE', 'plastic bag', 'review', 'Kenya restricts single-use plastic carrier bags'),
  ('ZA', 'rhino horn', 'block', 'Protected wildlife products');

insert into public.country_policies (country_code, kind, title, body) values
  (null, 'prohibited_items', 'Prohibited and restricted items (all markets)',
   E'The following may not be listed in any market: illegal drugs and drug paraphernalia; weapons, ammunition and explosives; protected wildlife and wildlife products; stolen goods; counterfeit or replica branded goods; human remains or body parts; hazardous chemicals; recalled products; adult services; financial instruments, credit or loans; and any item whose sale is unlawful in the seller''s or buyer''s country.\n\nSome items are restricted rather than prohibited and are reviewed before they appear publicly (for example certain medicines or regulated goods).\n\nThis list is a starting point configured by Naira Marketplace administrators and must be reviewed by qualified legal counsel for each active market.'),
  ('NG', 'prohibited_items', 'Additional rules for Nigeria',
   E'Prescription-only and NAFDAC-controlled medicines (e.g. tramadol, codeine syrups) may not be sold. Items subject to import prohibition lists may be removed. Please check current Nigerian regulations.'),
  ('KE', 'prohibited_items', 'Additional rules for Kenya',
   E'Single-use plastic carrier bags are restricted under Kenyan law. Listings will be reviewed.'),
  (null, 'safety', 'Trading safely',
   E'Meet in busy, public places. Inspect items before paying. Never send money in advance to someone you have not met unless you trust them. Be cautious of links that ask for passwords or card details. Naira Marketplace does not process product payments or deliveries and does not guarantee any seller, item, payment or delivery.');
