begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

\set chioma  '''00000000-0000-4000-8000-000000000002'''
\set tunde   '''00000000-0000-4000-8000-000000000003'''
\set kwame   '''00000000-0000-4000-8000-000000000004'''
\set buyer   '''00000000-0000-4000-8000-000000000005'''

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids select 'bag', id from listings where title like 'Leather handbag%';

-- ---------- Buyer contacts seller ----------
select set_config('request.jwt.claims', json_build_object('sub', :buyer, 'role', 'authenticated')::text, true);
set local role authenticated;
insert into ids select 'conv', start_conversation((select v from ids where k = 'bag'), 'Hi, is this available?');
select is((select count(*)::int from messages where conversation_id = (select v from ids where k = 'conv')), 1, 'Buyer can start a conversation');
select throws_ok($$insert into messages (conversation_id, sender_id, body) select v, auth.uid(), 'direct insert' from ids where k = 'conv'$$, '42501', null, 'Messages cannot be inserted directly (must use send_message)');
select throws_ok($$select start_conversation((select id from listings where seller_id = auth.uid() limit 1), 'x')$$, 'P0002', null, 'Cannot message about a missing listing');

-- offer
insert into ids select 'o1', make_offer((select v from ids where k = 'bag'), 3000000, 1, 'Can you do 30k?');
select is((select status::text from offers where id = (select v from ids where k = 'o1')), 'pending', 'Offer starts pending');
select is((select currency::text from offers where id = (select v from ids where k = 'o1')), 'NGN', 'Offer takes the listing currency');
select throws_ok($$select make_offer((select v from ids where k = 'bag'), 2900000)$$, '23505', null, 'Only one pending offer per buyer per listing');
select throws_ok($$select respond_offer((select v from ids where k = 'o1'), 'accept')$$, '42501', null, 'Proposer cannot accept their own offer');
select throws_ok($$select make_offer((select v from ids where k = 'bag'), -5)$$, '22023', null, 'Negative offer amounts are rejected');

-- ---------- Outsider cannot read ----------
select set_config('request.jwt.claims', json_build_object('sub', :kwame, 'role', 'authenticated')::text, true);
select is((select count(*)::int from conversations where id = (select v from ids where k = 'conv')), 0, 'Unrelated user cannot see the conversation');
select is((select count(*)::int from messages where conversation_id = (select v from ids where k = 'conv')), 0, 'Unrelated user cannot read the messages');
select is((select count(*)::int from offers where id = (select v from ids where k = 'o1')), 0, 'Unrelated user cannot see the offer');
select throws_ok($$select send_message((select v from ids where k = 'conv'), 'let me in')$$, 'P0002', null, 'Unrelated user cannot post into the conversation');
select throws_ok($$select respond_offer((select v from ids where k = 'o1'), 'accept')$$, 'P0002', null, 'Unrelated user cannot accept the offer');

-- ---------- Seller counters ----------
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
select is((select count(*)::int from messages where conversation_id = (select v from ids where k = 'conv')), 2, 'Seller sees the conversation (message + offer)');
insert into ids select 'o2', respond_offer((select v from ids where k = 'o1'), 'counter', 3300000, 'Best I can do');
select is((select status::text from offers where id = (select v from ids where k = 'o1')), 'countered', 'Original offer becomes countered');
select is((select status::text from offers where id = (select v from ids where k = 'o2')), 'pending', 'Counter-offer is pending');
select throws_ok($$select respond_offer((select v from ids where k = 'o1'), 'accept')$$, 'P0409', null, 'A countered offer can no longer be accepted');
select throws_ok($$select withdraw_offer((select v from ids where k = 'o1'))$$, 'P0002', null, 'Seller cannot withdraw the buyer''s offer');

-- ---------- Buyer accepts counter ----------
select set_config('request.jwt.claims', json_build_object('sub', :buyer, 'role', 'authenticated')::text, true);
select is((select review_eligibility((select v from ids where k = 'bag'))), 'ineligible', 'No review before an accepted offer');
select lives_ok($$select respond_offer((select v from ids where k = 'o2'), 'accept')$$, 'Buyer accepts the counter-offer');
select is((select status::text from offers where id = (select v from ids where k = 'o2')), 'accepted', 'Counter-offer accepted');
select throws_ok($$select withdraw_offer((select v from ids where k = 'o2'))$$, 'P0002', null, 'Accepted offer cannot be withdrawn by non-proposer');
select is((select review_eligibility((select v from ids where k = 'bag'))), 'agreed_price', 'Accepted offer makes buyer eligible for an unverified review');
select lives_ok($$select submit_review((select v from ids where k = 'bag'), 5, 'Great seller')$$, 'Eligible buyer can review');
select is((select verified_transaction from reviews where reviewer_id = auth.uid()), false, 'Review is labelled unverified until seller confirms the sale');

-- ---------- Blocking ----------
insert into blocked_users (blocker_id, blocked_id) values (:buyer, :chioma);
select throws_ok($$select send_message((select v from ids where k = 'conv'), 'hello?')$$, '42501', null, 'Blocked parties cannot message');

-- ---------- Reports ----------
select lives_ok($$insert into reports (target_type, listing_id, reason) select 'listing', v, 'misleading' from ids where k = 'bag'$$, 'User can report a listing');

-- ---------- Expiry ----------
reset role;
insert into ids select 'o3', id from offers where id = (select v from ids where k = 'o2');
insert into offers (listing_id, conversation_id, buyer_id, seller_id, proposed_by, amount_minor, currency, expires_at)
select listing_id, conversation_id, buyer_id, seller_id, buyer_id, 100, currency, now() - interval '1 minute' from offers where id = (select v from ids where k = 'o2')
returning id \gset exp_
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format($$select respond_offer(%L, 'accept')$$, :'exp_id'), 'P0409', 'This offer has expired', 'Expired offers cannot be accepted');
reset role;
select is(expire_offers() >= 1, true, 'Scheduled expiry marks overdue offers expired');

select * from finish();
rollback;
