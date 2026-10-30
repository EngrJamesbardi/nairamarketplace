-- DEVELOPMENT SEED DATA ONLY. Never run against production.
-- Every seeded profile, storefront and listing has is_seed = true and is labelled "Demo" in the UI.
-- All demo accounts use the password: Password123!

do $$
declare
  v_pw text := extensions.crypt('Password123!', extensions.gen_salt('bf'));
  v_users jsonb := '[
    {"id":"00000000-0000-4000-8000-000000000001","email":"admin@naira.test","name":"Ada Admin","country":"NG"},
    {"id":"00000000-0000-4000-8000-000000000002","email":"chioma@naira.test","name":"Chioma Okafor","country":"NG"},
    {"id":"00000000-0000-4000-8000-000000000003","email":"tunde@naira.test","name":"Tunde Bakare","country":"NG"},
    {"id":"00000000-0000-4000-8000-000000000004","email":"kwame@naira.test","name":"Kwame Mensah","country":"GH"},
    {"id":"00000000-0000-4000-8000-000000000005","email":"buyer@naira.test","name":"Bola Buyer","country":"NG"}
  ]';
  u jsonb;
begin
  for u in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', (u->>'id')::uuid, 'authenticated', 'authenticated', u->>'email', v_pw, now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u->>'name', 'country_code', u->>'country'),
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), (u->>'id')::uuid, u->>'id',
      jsonb_build_object('sub', u->>'id', 'email', u->>'email', 'email_verified', true), 'email', now(), now(), now());
  end loop;
end $$;

update public.profiles set is_seed = true where id::text like '00000000-0000-4000-8000-%';
update public.profiles set region_id = (select id from public.regions where name = 'Lagos') , city = 'Ikeja'
  where id in ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005');
update public.profiles set region_id = (select id from public.regions where name = 'Federal Capital Territory'), city = 'Wuse'
  where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set region_id = (select id from public.regions where name = 'Greater Accra'), city = 'Osu'
  where id = '00000000-0000-4000-8000-000000000004';

insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-000000000001', 'admin');

insert into public.seller_profiles (user_id, shop_name, slug, seller_type, description, country_code, region_id, city,
  whatsapp_number, show_whatsapp, delivery_options, is_featured, is_seed, business_hours)
values
  ('00000000-0000-4000-8000-000000000002', 'Chioma''s Closet', 'chiomas-closet', 'trader',
   'Demo storefront: quality ankara fabrics, ready-to-wear and accessories from Balogun market.',
   'NG', (select id from public.regions where name = 'Lagos'), 'Ikeja', '+2348000000002', true,
   array['local_pickup','seller_dispatch','courier']::public.delivery_option[], true, true,
   '{"mon_fri":"9:00-18:00","sat":"10:00-16:00"}'),
  ('00000000-0000-4000-8000-000000000003', 'Tunde Gadgets', 'tunde-gadgets', 'shop',
   'Demo storefront: phones, laptops and accessories. UK-used and brand new.',
   'NG', (select id from public.regions where name = 'Federal Capital Territory'), 'Wuse', null, false,
   array['local_pickup','buyer_collection','courier']::public.delivery_option[], true, true, null),
  ('00000000-0000-4000-8000-000000000004', 'Accra Home Goods', 'accra-home-goods', 'wholesaler',
   'Demo storefront: furniture, kitchenware and home appliances in Greater Accra.',
   'GH', (select id from public.regions where name = 'Greater Accra'), 'Osu', null, false,
   array['local_pickup','seller_dispatch']::public.delivery_option[], false, true, null);

-- Demo listings. Prices are minor units (kobo / pesewas).
with seller as (select user_id, country_code, region_id, city from public.seller_profiles),
data(seller_id, title, description, cat, subcat, price, ptype, cond, qty, img) as (values
  ('00000000-0000-4000-8000-000000000002'::uuid, 'Ankara fabric, 6 yards (Demo)', 'Bright wax print ankara fabric, 6 yards, 100% cotton. Several patterns available. Demo listing for development.', 'fashion-accessories', 'fabrics-textiles', 1800000, 'negotiable', 'new', 25, '/seed/fabric.svg'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'Women''s adire dress (Demo)', 'Hand-dyed adire dress, sizes 10-16. Demo listing for development.', 'fashion-accessories', 'womens-clothing', 2500000, 'fixed', 'new', 8, '/seed/dress.svg'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'Leather handbag (Demo)', 'Handmade leather handbag from Aba. Demo listing for development.', 'fashion-accessories', 'shoes-bags', 3500000, 'negotiable', 'new', 3, '/seed/bag.svg'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'Smartphone 128GB, UK used (Demo)', 'Clean UK-used smartphone, 128GB, battery health 89%. Demo listing for development.', 'phones-electronics', 'mobile-phones', 32000000, 'negotiable', 'used_good', 2, '/seed/phone.svg'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'Laptop 14-inch, 16GB RAM (Demo)', 'Lightweight 14-inch laptop, 16GB RAM, 512GB SSD. Demo listing for development.', 'phones-electronics', 'laptops-computers', 65000000, 'fixed', 'like_new', 1, '/seed/laptop.svg'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'Bluetooth speaker (Demo)', 'Portable bluetooth speaker, 12 hours battery. Demo listing for development.', 'phones-electronics', 'tv-audio', 2800000, 'fixed', 'new', 10, '/seed/speaker.svg'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'Generator 3.5kVA (Demo)', 'Petrol generator 3.5kVA, lightly used. Price on enquiry. Demo listing for development.', 'appliances', null, null, 'contact', 'used_good', 1, '/seed/generator.svg'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'Wooden dining set, 6 seats (Demo)', 'Solid wood dining table with 6 chairs. Demo listing for development.', 'home-furniture', 'furniture', 450000, 'negotiable', 'used_good', 1, '/seed/table.svg'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'Cooking pot set (Demo)', 'Stainless steel cooking pots, set of 5. Demo listing for development.', 'home-furniture', 'kitchenware', 85000, 'fixed', 'new', 30, '/seed/pots.svg'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'Chest freezer 200L (Demo)', 'Energy-saving 200L chest freezer. Demo listing for development.', 'appliances', null, 380000, 'negotiable', 'like_new', 2, '/seed/freezer.svg')
),
ins as (
  insert into public.listings (seller_id, country_code, region_id, city, latitude, longitude, title, description, category_id, subcategory_id,
    price_minor, currency, price_type, condition, quantity, delivery_options, status, is_seed)
  select d.seller_id, s.country_code, s.region_id, s.city, r.latitude, r.longitude, d.title, d.description,
    (select id from public.categories where slug = d.cat), (select id from public.categories where slug = d.subcat),
    d.price, (select currency_code from public.countries where code = s.country_code), d.ptype::public.price_type,
    d.cond::public.item_condition, d.qty, array['local_pickup','courier']::public.delivery_option[], 'active', true
  from data d join seller s on s.user_id = d.seller_id left join public.regions r on r.id = s.region_id
  returning id, title
)
insert into public.listing_images (listing_id, storage_path, url, position, alt_text)
select ins.id, 'seed' || d.img, d.img, 0, ins.title from ins join data d on d.title = ins.title;

-- Demo LGAs, so state + LGA search has something to find: Chioma's shop is in Ikeja (Lagos), Tunde's in Wuse (Abuja Municipal, FCT).
update public.listings l set area_id = a.id
from public.areas a join public.regions r on r.id = a.region_id
where l.is_seed and l.region_id = r.id
  and ((r.name = 'Lagos' and a.name = 'Ikeja') or (r.name = 'Federal Capital Territory' and a.name = 'Abuja Municipal'));
