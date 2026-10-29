begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

\set admin   '''00000000-0000-4000-8000-000000000001'''
\set chioma  '''00000000-0000-4000-8000-000000000002'''
\set tunde   '''00000000-0000-4000-8000-000000000003'''
\set kwame   '''00000000-0000-4000-8000-000000000004'''
\set buyer   '''00000000-0000-4000-8000-000000000005'''

-- Fixtures (as the table owner, rolled back at the end)
delete from seller_verifications where seller_id = :chioma;
update seller_profiles set verification_status = 'unverified', verified_at = null where user_id = :chioma;
update profiles set status = 'active', suspended_reason = null, suspended_until = null where id in (:buyer, :kwame);
insert into user_roles(user_id, role) values (:tunde, 'moderator') on conflict do nothing;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;
insert into ids select 'listing', id::text from listings where seller_id = :kwame and status = 'active' limit 1;

-- ---------- Ordinary member ----------
select set_config('request.jwt.claims', json_build_object('sub', :buyer, 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select admin_stats()$$, '42501', null, 'Members cannot read admin statistics');
select throws_ok($$select moderate_listing((select v::uuid from ids where k = 'listing'), 'remove', 'x')$$, '42501', null, 'Members cannot moderate listings');
select throws_ok(format($$select admin_set_role(%L, 'admin', true)$$, :buyer), '42501', null, 'Members cannot grant themselves admin');
select throws_ok(format($$insert into user_roles(user_id, role) values (%L, 'admin')$$, :buyer), '42501', null, 'Members cannot insert roles directly');
select throws_ok(format($$update profiles set status = 'active', suspended_reason = 'x' where id = %L$$, :buyer), '42501', null, 'Members cannot change protected profile fields');
select is((select count(*)::int from admin_audit_logs), 0, 'Members cannot read the audit log');
select throws_ok($$select admin_update_country('KE', '{"is_active": true}')$$, '42501', null, 'Members cannot change market configuration');

-- ---------- Seller verification ----------
select set_config('request.jwt.claims', json_build_object('sub', :chioma, 'role', 'authenticated')::text, true);
select throws_ok(format($$update seller_profiles set verification_status = 'verified' where user_id = %L$$, :chioma), '42501', null, 'Sellers cannot verify themselves');
insert into ids select 'ver', request_seller_verification('Chioma Closet Ltd', 'RC123456', 'test')::text;
select is((select verification_status::text from seller_profiles where user_id = :chioma), 'pending', 'Verification request marks the shop pending');
select throws_ok($$select request_seller_verification('x', 'y', 'z')$$, '23505', null, 'Only one pending verification request at a time');

-- ---------- Moderator ----------
select set_config('request.jwt.claims', json_build_object('sub', :tunde, 'role', 'authenticated')::text, true);
select lives_ok($$select moderate_listing((select v::uuid from ids where k = 'listing'), 'remove', 'Test removal')$$, 'Moderators can remove a listing');
select throws_ok($$select admin_review_verification((select v::uuid from ids where k = 'ver'), true, 'ok')$$, '42501', null, 'Moderators cannot approve verifications');
select throws_ok(format($$select admin_set_role(%L, 'moderator', true)$$, :buyer), '42501', null, 'Moderators cannot grant roles');
select throws_ok(format($$select admin_set_user_status(%L, 'suspended', 'x')$$, :admin), '42501', null, 'Moderators cannot suspend administrators');
select is((select count(*)::int from admin_audit_logs), 0, 'Moderators cannot read the audit log');

-- ---------- Administrator ----------
select set_config('request.jwt.claims', json_build_object('sub', :admin, 'role', 'authenticated')::text, true);
select lives_ok($$select admin_review_verification((select v::uuid from ids where k = 'ver'), true, 'Checked against registry')$$, 'Admin approves verification');
select is((select verification_status::text from seller_profiles where user_id = :chioma), 'verified', 'Approved seller shows as verified');
select lives_ok(format($$select admin_set_user_status(%L, 'suspended', 'Spam', now() + interval '7 days')$$, :kwame), 'Admin suspends a member');
select throws_ok(format($$select admin_set_role(%L, 'admin', false)$$, :admin), '42501', null, 'Admin cannot remove their own admin role');
select ok((select count(*) from admin_audit_logs where action in ('listing.remove', 'verification.approve', 'user.suspended')) >= 3, 'Privileged actions are written to the audit log');
select throws_ok($$update admin_audit_logs set action = 'tampered'$$, '42501', null, 'Audit log cannot be edited by an admin');

-- Suspension takes effect
select set_config('request.jwt.claims', json_build_object('sub', :buyer, 'role', 'authenticated')::text, true);
select is((select count(*)::int from listings where seller_id = :kwame), 0, 'Suspended seller''s listings are hidden from the public');

reset role;
select throws_ok($$delete from admin_audit_logs$$, '42501', null, 'Audit log is append-only even for the database owner');
select throws_ok($$update moderation_actions set reason = 'x'$$, '42501', null, 'Moderation history is append-only');

-- ---------- Privacy: self-deletion ----------
select set_config('request.jwt.claims', json_build_object('sub', :buyer, 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$select anonymise_my_account()$$, 'Member can delete (anonymise) their account');
reset role;
select is((select display_name || '/' || status::text || '/' || coalesce(phone, '-') from profiles where id = :buyer), 'Deleted member/deleted/-', 'Deleted account is anonymised');

select * from finish();
rollback;
