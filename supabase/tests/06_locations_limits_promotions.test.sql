begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- ids from seed.sql
\set chioma  '''00000000-0000-4000-8000-000000000002'''
\set kwame   '''00000000-0000-4000-8000-000000000004'''
\set buyer   '''00000000-0000-4000-8000-000000000005'''

-- ---------- Location data ----------
select is((select count(*)::int from regions where country_code = 'NG'), 37, 'Nigeria has 36 states + the FCT');
select is((select count(*)::int from areas where country_code = 'NG'), 774, 'Nigeria has 774 LGAs');
select is((select count(*)::int from regions r where r.country_code = 'NG' and not exists (select 1 from areas a where a.region_id = r.id)), 0,
  'Every Nigerian state (and the FCT) has its LGAs');
select is((select count(*)::int from areas a join regions r on r.id = a.region_id where r.country_code <> a.country_code), 0,
  'No LGA belongs to a region in another country');
select results_eq($$select r.name, count(a.*)::int from regions r join areas a on a.region_id = r.id
                    where r.name in ('Delta', 'Lagos', 'Kano', 'Federal Capital Territory', 'Bayelsa') group by r.name order by r.name$$,
  $$values ('Bayelsa', 8), ('Delta', 25), ('Federal Capital Territory', 6), ('Kano', 44), ('Lagos', 20)$$,
  'Sample states have their constitutional number of LGAs');
select is((select r.name from areas a join regions r on r.id = a.region_id where a.name = 'Oshimili North'), 'Delta', 'Oshimili North is in Delta');
select is((select count(*)::int from regions where country_code = 'GH'), 16, 'Ghana has its 16 regions');
select is((select count(*)::int from areas where country_code = 'GH'), 0, 'Ghana has no second-level areas yet (no LGA select there)');
select is((select area_label from countries where code = 'GH'), null, 'Ghana markets do not show an LGA field');
select is((select area_label from countries where code = 'NG'), 'LGA', 'Nigeria shows an LGA field');

select id as delta from regions where country_code = 'NG' and name = 'Delta' \gset
select id as lagos from regions where country_code = 'NG' and name = 'Lagos' \gset
select id as oshimili from areas where name = 'Oshimili North' \gset
select id as ikeja from areas where name = 'Ikeja' \gset
select id as accra from regions where country_code = 'GH' and name = 'Greater Accra' \gset
select id as tv from categories where slug = 'phones-electronics' \gset

-- ---------- Free listing allowance ----------
select is((select free_active_listing_limit from countries where code = 'NG'), 15, 'Free allowance is 15 in Nigeria');
select is((select free_active_listing_limit from countries where code = 'GH'), 15, 'Free allowance is 15 in Ghana');

-- Start from the seed state (end-to-end runs may have left extra listings; this transaction is rolled back).
update listings set status = 'archived' where seller_id = :chioma and not is_seed;
update listings set created_at = now() - interval '2 hours' where seller_id = :chioma;  -- outside the new-listing rate window

select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(format($$insert into listings (seller_id, country_code, region_id, area_id, title, description, category_id, price_minor, currency, condition)
  values (%L, 'NG', %s, %s, 'Television 43 inch', 'Smart television, 43 inch, works well', %s, 15000000, 'NGN', 'used_good')$$, :chioma, :lagos, :oshimili, :tv),
  '23514', null, 'An LGA from another state is rejected (Oshimili North is not in Lagos)');
select throws_ok(format($$insert into listings (seller_id, country_code, area_id, title, description, category_id, price_minor, currency, condition)
  values (%L, 'NG', %s, 'Television 43 inch', 'Smart television, 43 inch, works well', %s, 15000000, 'NGN', 'used_good')$$, :chioma, :oshimili, :tv),
  '23514', null, 'An LGA without a state is rejected');
select throws_ok(format($$insert into listings (seller_id, country_code, region_id, title, description, category_id, price_minor, currency, condition)
  values (%L, 'NG', %s, 'Television 43 inch', 'Smart television, 43 inch, works well', %s, 15000000, 'NGN', 'used_good')$$, :chioma, :accra, :tv),
  '23514', null, 'A Ghanaian region cannot be used for a Nigerian listing');
select lives_ok(format($$insert into listings (seller_id, country_code, region_id, area_id, title, description, category_id, price_minor, currency, condition)
  values (%L, 'NG', %s, %s, 'Television 43 inch', 'Smart television, 43 inch, works well', %s, 15000000, 'NGN', 'used_good')$$, :chioma, :delta, :oshimili, :tv),
  'A listing in Delta / Oshimili North is accepted');
select id as tvlisting from listings where title = 'Television 43 inch' \gset

-- Chioma has 3 seed listings + the TV = 4 active. Fill up to 15.
insert into listings (seller_id, country_code, region_id, title, description, category_id, price_minor, currency, condition)
select :chioma, 'NG', :lagos, 'Filler item ' || g, 'Filler description for limit test', :tv, 100000, 'NGN', 'new' from generate_series(1, 11) g;
select is(active_listing_count(:chioma), 15, 'Seller now has 15 active listings');
select is(active_listing_count(:kwame), 0, 'Members cannot count another seller''s listings');

-- Photos never count as listings.
insert into listing_images (listing_id, storage_path, url, position)
select :'tvlisting', 'seed/p' || g, '/seed/phone.svg', g from generate_series(0, 9) g;
select is(active_listing_count(:chioma), 15, 'Ten photos on one listing still count as one listing');
select throws_ok(format($$insert into listing_images (listing_id, storage_path, url, position) values (%L, 'seed/p11', '/seed/phone.svg', 10)$$, :'tvlisting'),
  '23514', null, 'An 11th photo is rejected');

select throws_ok(format($$insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition)
  values (%L, 'NG', 'One too many', 'This would be the sixteenth listing', %s, 100000, 'NGN', 'new')$$, :chioma, :tv),
  'P0001', null, 'The 16th active listing is refused on the free plan');
select lives_ok(format($$insert into listings (seller_id, country_code, title, description, category_id, price_minor, currency, condition, status)
  values (%L, 'NG', 'Saved for later', 'A draft does not count towards the allowance', %s, 100000, 'NGN', 'new', 'draft')$$, :chioma, :tv),
  'A draft can still be saved at the limit');
update listings set status = 'sold' where title = 'Filler item 1';
select is(active_listing_count(:chioma), 14, 'A sold listing stops counting');
select lives_ok($$update listings set status = 'active' where title = 'Saved for later'$$, 'After one sells, the draft can be published');

-- Grandfathering: an admin lowering the allowance never unpublishes anything.
reset role;
update countries set free_active_listing_limit = 5 where code = 'NG';
select is(active_listing_count(:chioma), 15, 'Lowering the allowance leaves existing active listings live');
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok(format($$update listings set title = 'Television 43 inch, remote included' where id = %L$$, :'tvlisting'),
  'Sellers above the allowance can still edit live listings');
select throws_ok($$update listings set status = 'active' where title = 'Filler item 1'$$, 'P0001', null, 'but cannot activate another one');

-- Listings past their expiry date do not count even before the expiry job runs.
reset role;
update countries set free_active_listing_limit = 15 where code = 'NG';
update listings set expires_at = now() - interval '1 day' where title like 'Filler item %' and status = 'active';
select is(active_listing_count(:chioma), 5, 'Listings past their expiry date stop counting');

-- A paid plan raises the allowance.
insert into subscriptions(user_id, plan_id, current_period_end)
select :chioma, id, now() + interval '30 days' from subscription_plans where country_code = 'NG' and code = 'trader-plus';
select is(active_listing_limit(:chioma, 'NG'), 200, 'Trader Plus raises the allowance to 200');
delete from subscriptions where user_id = :chioma;

-- ---------- Search by state and LGA ----------
select set_config('request.jwt.claims', json_build_object('sub', :buyer, 'role', 'authenticated')::text, true);
set local role authenticated;
select ok(exists (select 1 from search_listings(p_query => 'television', p_country => 'NG', p_region_id => :delta, p_area_id => :oshimili) where id = :'tvlisting'),
  'Keyword + state + LGA finds the television in Oshimili North');
select ok(not exists (select 1 from search_listings(p_query => 'television', p_country => 'NG', p_region_id => :lagos) where id = :'tvlisting'),
  'Searching Lagos does not return the Delta television');
select ok(not exists (select 1 from search_listings(p_country => 'NG', p_area_id => :ikeja) where id = :'tvlisting'),
  'Searching Ikeja LGA does not return the Oshimili North television');
select ok(exists (select 1 from search_listings(p_query => 'television', p_country => 'NG', p_category => 'phones-electronics', p_region_id => :delta) where id = :'tvlisting'),
  'Keyword + category + state finds it');
select ok(exists (select 1 from search_listings(p_query => 'television', p_country => 'NG') where id = :'tvlisting'), 'No location searches the whole market');
select is((select area_name from listing_cards where id = :'tvlisting'), 'Oshimili North', 'Cards carry the LGA name');

-- ---------- Paid promotion packages ----------
select is((select count(*)::int from promotion_packages where country_code = 'NG' and is_active), 2, 'Nigeria has the two starting packages');
select is((select count(*)::int from promotion_packages where country_code <> 'NG'), 0, 'No naira packages are applied to other markets');
select id as pkg7 from promotion_packages where code = 'promote-7' \gset
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
select reference as ref from start_promotion_checkout(:'pkg7', :'tvlisting') \gset
select is((select amount_minor from platform_payments where reference = :'ref'), 200000::bigint, 'Checkout uses the catalogue price (NGN 2,000)');
select is((select count(*)::int from promotion_campaigns where listing_id = :'tvlisting'), 0, 'Nothing is promoted before payment is verified');
select throws_ok(format($$select complete_payment('mock', %L, 200000, 'NGN', 'tx1')$$, :'ref'), '42501', null, 'Sellers cannot complete their own payment');

reset role;
select is(complete_payment('mock', :'ref', 200000, 'NGN', 'tx1'), 'succeeded', 'The verified webhook completes the payment');
select ok((select count(*) = 3 and bool_and(ends_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute')
           from promotion_campaigns where listing_id = :'tvlisting' and payment_id is not null), 'The 7-day promotion runs in three placements for 7 days');
select is(complete_payment('mock', :'ref', 200000, 'NGN', 'tx1'), 'already_processed', 'A duplicate webhook changes nothing');
select is((select count(*)::int from promotion_campaigns where listing_id = :'tvlisting'), 3, 'and creates no extra campaigns');

-- Buying again while it runs extends the same promotion.
select id as pkg30 from promotion_packages where code = 'promote-30' \gset
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;
select reference as ref30 from start_promotion_checkout(:'pkg30', :'tvlisting') \gset
select throws_ok(format($$select cancel_promotion(%L)$$, (select id from promotion_campaigns where listing_id = :'tvlisting' limit 1)),
  '22023', null, 'A paid promotion cannot be cancelled for a credit refund');
reset role;
select is(complete_payment('mock', :'ref30', 500000, 'NGN', 'tx2'), 'succeeded', 'The 30-day package is paid');
select ok((select count(*) = 3 and bool_and(ends_at > now() + interval '36 days') from promotion_campaigns where listing_id = :'tvlisting'),
  'A second package extends the running promotion (7 + 30 days) instead of duplicating it');

-- Expiry.
select ok(exists (select 1 from get_sponsored('homepage', 'NG', null, null, 50) where listing_id = :'tvlisting'), 'The live paid promotion is served on the homepage');
update promotion_campaigns set ends_at = now() - interval '1 minute' where listing_id = :'tvlisting';
select ok(not exists (select 1 from get_sponsored('homepage', 'NG', null, null, 50) where listing_id = :'tvlisting'), 'An expired promotion is never served');
select ok(expire_promotions() >= 3, 'The maintenance job ends expired promotions');
select ok((select bool_and(status = 'ended') from promotion_campaigns where listing_id = :'tvlisting'), 'and they show as ended');

select * from finish();
rollback;
