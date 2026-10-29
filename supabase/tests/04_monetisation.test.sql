begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

\set admin   '''00000000-0000-4000-8000-000000000001'''
\set chioma  '''00000000-0000-4000-8000-000000000002'''
\set tunde   '''00000000-0000-4000-8000-000000000003'''
\set buyer   '''00000000-0000-4000-8000-000000000005'''

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, service_role, anon;
insert into ids select 'starter', id::text from credit_packages where country_code = 'NG' and name = 'Starter';
insert into ids select 'standard', id::text from credit_packages where country_code = 'NG' and name = 'Standard';
insert into ids select 'ke_pkg', id::text from credit_packages where country_code = 'KE' limit 1;
insert into ids select 'plan', id::text from subscription_plans where country_code = 'NG' and code = 'trader-plus';
insert into ids select 'l1', id::text from listings where seller_id = :chioma and status = 'active' order by created_at limit 1;

-- ---------- Clients cannot touch money tables directly ----------
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format($$insert into credit_transactions(user_id, delta, balance_after, kind, idempotency_key) values (%L, 1000, 1000, 'purchase', 'fake-grant-1')$$, :chioma), '42501', null, 'Users cannot write ledger rows');
select throws_ok($$update credit_accounts set balance = 999999$$, '42501', null, 'Users cannot edit balances');
select throws_ok($$select complete_payment('mock', 'NM-X', 1, 'NGN', 'tx')$$, '42501', null, 'Users cannot complete payments');
select throws_ok($$select record_promotion_event(gen_random_uuid(), 'click', repeat('a', 20))$$, '42501', null, 'Users cannot record promotion events directly');
select throws_ok($$select * from start_checkout('credits', (select v::uuid from ids where k = 'ke_pkg'))$$, '22023', null, 'No checkout in an inactive market');

-- ---------- Checkout -> verified completion -> credits ----------
insert into ids select 'p1', reference from start_checkout('credits', (select v::uuid from ids where k = 'starter'));
select is((select status::text || '/' || amount_minor || '/' || currency from platform_payments where reference = (select v from ids where k = 'p1')), 'pending/250000/NGN', 'Checkout creates a pending payment at the package price');
select is(my_credit_balance(), 0::bigint, 'No credits before the payment is confirmed');

reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
select is(complete_payment('mock', (select v from ids where k = 'p1'), 250000, 'NGN', 'mock-tx-1'), 'succeeded', 'Verified payment completes');
select is(complete_payment('mock', (select v from ids where k = 'p1'), 250000, 'NGN', 'mock-tx-1'), 'already_processed', 'Duplicate webhook is a no-op');
select is(complete_payment('mock', 'NM-DOES-NOT-EXIST', 250000, 'NGN', 'x'), 'unknown_reference', 'Unknown references are rejected');
select is(complete_payment('paystack', (select v from ids where k = 'p1'), 250000, 'NGN', 'x'), 'provider_mismatch', 'Callback from a different provider is rejected');
reset role;
select is((select balance from credit_accounts where user_id = :chioma), 50::bigint, 'Credits granted exactly once');

-- amount mismatch
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;
insert into ids select 'p2', reference from start_checkout('credits', (select v::uuid from ids where k = 'standard'));
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
select is(complete_payment('mock', (select v from ids where k = 'p2'), 100, 'NGN', 'mock-tx-2'), 'amount_mismatch', 'Underpayment is not accepted');
reset role;
select is((select status::text from platform_payments where reference = (select v from ids where k = 'p2')), 'failed', 'Mismatched payment is marked failed');
select is((select balance from credit_accounts where user_id = :chioma), 50::bigint, 'No credits for a mismatched amount');

-- ---------- Promotions ----------
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;
insert into ids select 'c1', create_promotion((select v::uuid from ids where k = 'l1'), 'homepage', 1)::text;
select is(my_credit_balance(), 25::bigint, 'Promotion debits credits per day x days');
select throws_ok($$select create_promotion((select v::uuid from ids where k = 'l1'), 'homepage', 1)$$, '23505', null, 'One running promotion per listing and placement');
select throws_ok($$select create_promotion((select v::uuid from ids where k = 'l1'), 'search', 3)$$, 'P0402', null, 'Cannot spend more credits than the balance');
select is((select count(*)::int from promotion_campaigns where listing_id = (select v::uuid from ids where k = 'l1') and placement = 'search'), 0, 'Failed spend leaves no campaign behind');

select set_config('request.jwt.claims', json_build_object('sub', :tunde, 'role', 'authenticated')::text, true);
select throws_ok($$select create_promotion((select v::uuid from ids where k = 'l1'), 'search', 1)$$, 'P0002', null, 'Cannot promote someone else''s listing');
select is((select count(*)::int from credit_transactions where user_id = :chioma), 0, 'Users cannot read other people''s ledger');

reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select is((select count(*)::int from get_sponsored('homepage', 'NG') where campaign_id = (select v::uuid from ids where k = 'c1')), 1, 'Live campaign is served on its placement');
select is((select count(*)::int from get_sponsored('homepage', 'GH')), 0, 'Campaigns are not served in other markets');
reset role;

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
select ok(record_promotion_event((select v::uuid from ids where k = 'c1'), 'impression', repeat('v', 32)), 'First impression from a viewer counts');
select ok(not record_promotion_event((select v::uuid from ids where k = 'c1'), 'impression', repeat('v', 32)), 'Repeat impression from the same viewer the same day does not count');
select ok(not record_promotion_event((select v::uuid from ids where k = 'c1'), 'click', repeat('s', 32), :chioma), 'Seller''s own clicks are not counted');
reset role;
select is((select impressions || '/' || clicks from promotion_campaigns where id = (select v::uuid from ids where k = 'c1')), '1/0', 'Counters reflect only real, de-duplicated events');

-- cancel with refund of whole unused days (top up first via a second verified payment)
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;
insert into ids select 'p3', reference from start_checkout('credits', (select v::uuid from ids where k = 'standard'));
reset role;
select complete_payment('mock', (select v from ids where k = 'p3'), 500000, 'NGN', 'mock-tx-3');
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;
insert into ids select 'c2', create_promotion((select v::uuid from ids where k = 'l1'), 'search', 3)::text;
select is(my_credit_balance(), 115::bigint, '145 - 30 = 115 after a 3-day search promotion');
reset role;
-- simulate 25 hours of the campaign having run (now() is fixed inside a transaction)
update promotion_campaigns set starts_at = starts_at - interval '25 hours', ends_at = ends_at - interval '25 hours' where id = (select v::uuid from ids where k = 'c2');
set local role authenticated;
select is(cancel_promotion((select v::uuid from ids where k = 'c2')), 10, 'Cancelling refunds only whole unused days (1 of 3)');
select is(my_credit_balance(), 125::bigint, 'Refund credited to the ledger');

-- ---------- Subscriptions ----------
insert into ids select 'p4', reference from start_checkout('subscription', (select v::uuid from ids where k = 'plan'));
reset role;
select complete_payment('mock', (select v from ids where k = 'p4'), 300000, 'NGN', 'mock-tx-4');
select is(active_listing_limit(:chioma, 'NG'), 200, 'Paid plan raises the active listing allowance');
select is((select balance from credit_accounts where user_id = :chioma), 165::bigint, 'Plan includes its period credits');

-- ---------- Admin adjustments and integrity ----------
select set_config('request.jwt.claims', json_build_object('sub', :admin, 'role', 'authenticated')::text, true);
set local role authenticated;
select admin_adjust_credits(:buyer, 10, 'Goodwill', '11111111-1111-4111-8111-111111111111');
select admin_adjust_credits(:buyer, 10, 'Goodwill', '11111111-1111-4111-8111-111111111111');
select is((select balance from credit_accounts where user_id = :buyer), 10::bigint, 'Double-submitted admin adjustment applies once');
reset role;
select throws_ok($$update credit_transactions set delta = 1000$$, '42501', null, 'Ledger rows are immutable, even for the owner role');
select is((select count(*)::int from credit_ledger_mismatches()), 0, 'Every balance equals the sum of its ledger');

select * from finish();
rollback;
