begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ids from seed.sql
\set admin   '''00000000-0000-4000-8000-000000000001'''
\set chioma  '''00000000-0000-4000-8000-000000000002'''
\set tunde   '''00000000-0000-4000-8000-000000000003'''
\set buyer   '''00000000-0000-4000-8000-000000000005'''

-- ---------- Listing ownership ----------
select set_config('request.jwt.claims', json_build_object('sub', :tunde, 'role', 'authenticated')::text, true);
set local role authenticated;
update listings set title = 'Hijacked title' where seller_id = :chioma;
select is((select count(*)::int from listings where title = 'Hijacked title'), 0, 'Seller cannot update another seller''s listing (RLS filters it out)');
select throws_ok(
  format($$insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition)
          values (%L, 'NG', 'Fake listing', 'Posting as someone else', 1, 100, 'NGN', 'new')$$, :chioma),
  '42501', null, 'Seller cannot create a listing on behalf of another seller');

-- own listing works
select lives_ok(
  $$update listings set title = 'Smartphone 128GB (edited)' where seller_id = auth.uid() and title like 'Smartphone%'$$,
  'Seller can edit own listing');

-- protected listing fields
select throws_ok(
  $$update listings set moderation_status = 'approved', view_count = 99999 where seller_id = auth.uid() and title like 'Laptop%'$$,
  '42501', null, 'Seller cannot change moderation status or inflate views');

-- currency integrity
select throws_ok(
  format($$insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition)
          values (%L, 'NG', 'Wrong currency', 'Priced in cedis in Nigeria', 1, 100, 'GHS', 'new')$$, :tunde),
  '23514', null, 'Listing currency must match its market currency');

-- prohibited items are blocked / held
select throws_ok(
  format($$insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition)
          values (%L, 'NG', 'Tramadol tablets', 'Strong tramadol for sale', 1, 100, 'NGN', 'new')$$, :tunde),
  '23514', null, 'Blocked prohibited term rejects the listing');
select lives_ok(
  format($$insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition)
          values (%L, 'NG', 'Replica watch', 'Good replica of a famous brand', 1, 100, 'NGN', 'new')$$, :tunde),
  'Review-level term is accepted…');
select is((select moderation_status::text from listings where title = 'Replica watch'), 'pending_review', '…but held for moderator review');

-- inactive market
select throws_ok(
  format($$insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition)
          values (%L, 'ZA', 'Item in SA', 'South Africa is not active yet', 1, 100, 'ZAR', 'new')$$, :tunde),
  '42501', null, 'Cannot list in a market that is not active');

-- ---------- Privilege escalation ----------
select throws_ok(
  format($$insert into user_roles (user_id, role) values (%L, 'admin')$$, :tunde),
  '42501', null, 'User cannot grant themselves admin');
select throws_ok(
  $$update profiles set suspended_reason = 'nothing to see' where id = auth.uid()$$,
  '42501', null, 'User cannot edit moderation fields on their profile');
reset role;
update profiles set status = 'suspended', suspended_reason = 'test' where id = :tunde;
set local role authenticated;
select throws_ok(
  $$update profiles set status = 'active' where id = auth.uid()$$,
  '42501', null, 'Suspended user cannot lift their own suspension');
select throws_ok(
  $$update seller_profiles set verification_status = 'verified' where user_id = auth.uid()$$,
  '42501', null, 'Seller cannot mark themselves verified');
select throws_ok($$select phone from profiles$$, '42501', null, 'Private profile columns (phone) are not readable directly');

-- ---------- Guest ----------
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select ok((select count(*) from listing_cards) > 0, 'Guests can browse public listings');
select is((select count(*)::int from listings where moderation_status <> 'approved'), 0, 'Guests never see unapproved listings');
select throws_ok(format($$insert into favourites (user_id, listing_id) select %L::uuid, id from listings limit 1$$, :buyer), '42501', null, 'Guests cannot write');

select * from finish();
rollback;
