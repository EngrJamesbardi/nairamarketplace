begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ids from seed.sql
\set chioma  '''00000000-0000-4000-8000-000000000002'''
\set buyer   '''00000000-0000-4000-8000-000000000005'''

select id as listing from listings where seller_id = :chioma and status = 'active' order by created_at limit 1 \gset
select published_at as published, expires_at as expires from listings where id = :'listing' \gset

select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;

-- ---------- Lifecycle fields are server-managed ----------
update listings set published_at = now() + interval '6 days', expires_at = now() + interval '100 years',
  sold_to = :buyer, sold_at = now() where id = :'listing';
select is((select published_at from listings where id = :'listing'), :'published'::timestamptz, 'Seller cannot future-date published_at to game ranking');
select is((select expires_at from listings where id = :'listing'), :'expires'::timestamptz, 'Seller cannot push expires_at out');
select is((select sold_to from listings where id = :'listing'), null, 'Seller cannot name a buyer without mark_listing_sold()');
select is(review_eligibility(:'listing', :buyer), 'ineligible', 'A forged sold_to does not make a member eligible for a verified review');

-- ---------- Renewal keeps an expiry date ----------
select lives_ok(format('select renew_listing(%L)', :'listing'), 'Seller can renew an active listing');
select ok((select expires_at > now() + interval '59 days' from listings where id = :'listing'), 'Renewing an active listing sets a fresh expiry date instead of removing it');

-- ---------- Idempotent listing creation ----------
insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition, client_request_id)
values (:chioma, 'NG', 'Idempotent kettle', 'Electric kettle, works well', 1, 500000, 'NGN', 'used_good', 'aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  format($$insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition, client_request_id)
          values (%L, 'NG', 'Idempotent kettle', 'Electric kettle, works well', 1, 500000, 'NGN', 'used_good', 'aaaaaaaa-0000-4000-8000-000000000001')$$, :chioma),
  '23505', null, 'The same form submission cannot create a second listing');
select is((select count(*)::int from listings where seller_id = auth.uid() and title = 'Idempotent kettle'), 1, 'Exactly one listing exists for a repeated submission');

select * from finish();
rollback;
