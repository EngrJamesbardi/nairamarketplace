-- Shared helpers for pgTAP tests (run: npx supabase test db). Relies on supabase/seed.sql demo users.
begin;
select plan(1);
select ok(true, 'helpers loaded');
select * from finish();
rollback;
