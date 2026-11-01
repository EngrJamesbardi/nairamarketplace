-- Explicit Data API grants.
--
-- Since 30 Oct 2026, new Supabase projects no longer grant the API roles (anon, authenticated, service_role)
-- access to new tables in the public schema automatically:
-- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
-- The earlier migrations were written for the old behaviour: they relied on those default grants and only
-- revoked what had to be taken away. On a new hosted project every table was therefore "permission denied",
-- even for service_role.
--
-- This migration sets the access explicitly, so every database ends up the same whatever its defaults:
--   * first it removes every table, view and sequence privilege the API roles hold in public;
--   * then it grants exactly the SELECT / INSERT / UPDATE / DELETE privileges (table and column level) that
--     the local stack had after migrations 20261029000001-20261030000003, which is what the app and its
--     tests were built against. Row-level security (on for every table) and the protect_* triggers still
--     decide which rows each user can see or change.
-- TRUNCATE, REFERENCES and TRIGGER are not re-granted: the Data API never uses them.
-- Function EXECUTE grants are unchanged (functions are not affected by the Supabase change).
--
-- New tables added by later migrations must grant their own access, e.g.
--   grant select on public.new_table to anon, authenticated;
--   grant select, insert, update, delete on public.new_table to service_role;

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;

grant select on public.admin_audit_logs to anon;
grant select on public.admin_audit_logs to authenticated;
grant select, insert, update, delete on public.admin_audit_logs to service_role;
grant select on public.areas to anon;
grant select on public.areas to authenticated;
grant select, insert, update, delete on public.areas to service_role;
grant select, insert, update, delete on public.blocked_users to anon;
grant select, insert, update, delete on public.blocked_users to authenticated;
grant select, insert, update, delete on public.blocked_users to service_role;
grant select on public.categories to anon;
grant select on public.categories to authenticated;
grant select, insert, update, delete on public.categories to service_role;
grant select, update on public.conversation_participants to anon;
grant select on public.conversation_participants to authenticated;
grant select, insert, update, delete on public.conversation_participants to service_role;
grant update (archived_at) on public.conversation_participants to authenticated;
grant select on public.conversations to anon;
grant select on public.conversations to authenticated;
grant select, insert, update, delete on public.conversations to service_role;
grant select on public.countries to anon;
grant select on public.countries to authenticated;
grant select, insert, update, delete on public.countries to service_role;
grant select on public.country_policies to anon;
grant select on public.country_policies to authenticated;
grant select, insert, update, delete on public.country_policies to service_role;
grant select on public.credit_accounts to anon;
grant select on public.credit_accounts to authenticated;
grant select, insert, update, delete on public.credit_accounts to service_role;
grant select on public.credit_packages to anon;
grant select on public.credit_packages to authenticated;
grant select, insert, update, delete on public.credit_packages to service_role;
grant select on public.credit_transactions to anon;
grant select on public.credit_transactions to authenticated;
grant select, insert, update, delete on public.credit_transactions to service_role;
grant select, insert, update, delete on public.favourites to anon;
grant select, insert, update, delete on public.favourites to authenticated;
grant select, insert, update, delete on public.favourites to service_role;
grant select, insert, update, delete on public.listing_cards to anon;
grant select, insert, update, delete on public.listing_cards to authenticated;
grant select, insert, update, delete on public.listing_cards to service_role;
grant select, insert, update, delete on public.listing_images to anon;
grant select, insert, update, delete on public.listing_images to authenticated;
grant select, insert, update, delete on public.listing_images to service_role;
grant select, insert, update, delete on public.listing_view_events to anon;
grant select, insert, update, delete on public.listing_view_events to authenticated;
grant select, insert, update, delete on public.listing_view_events to service_role;
grant select, insert, update, delete on public.listings to anon;
grant select, insert, update, delete on public.listings to authenticated;
grant select, insert, update, delete on public.listings to service_role;
grant select on public.messages to anon;
grant select on public.messages to authenticated;
grant select, insert, update, delete on public.messages to service_role;
grant select on public.moderation_actions to anon;
grant select on public.moderation_actions to authenticated;
grant select, insert, update, delete on public.moderation_actions to service_role;
grant select, insert, update, delete on public.notifications to anon;
grant select, insert, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
grant update (read_at) on public.notifications to authenticated;
grant select on public.offers to anon;
grant select on public.offers to authenticated;
grant select, insert, update, delete on public.offers to service_role;
grant select on public.payment_events to anon;
grant select on public.payment_events to authenticated;
grant select, insert, update, delete on public.payment_events to service_role;
grant select on public.platform_payments to anon;
grant select on public.platform_payments to authenticated;
grant select, insert, update, delete on public.platform_payments to service_role;
grant select on public.platform_settings to anon;
grant select on public.platform_settings to authenticated;
grant select, insert, update, delete on public.platform_settings to service_role;
grant insert, update, delete on public.profiles to anon;
grant insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
grant select (avatar_url, bio, city, country_code, created_at, display_name, id, is_seed, status) on public.profiles to anon;
grant select (avatar_url, bio, city, country_code, created_at, display_name, id, is_seed, status) on public.profiles to authenticated;
grant select on public.prohibited_terms to anon;
grant select on public.prohibited_terms to authenticated;
grant select, insert, update, delete on public.prohibited_terms to service_role;
grant select on public.promotion_campaigns to anon;
grant select on public.promotion_campaigns to authenticated;
grant select, insert, update, delete on public.promotion_campaigns to service_role;
grant select on public.promotion_events to anon;
grant select on public.promotion_events to authenticated;
grant select, insert, update, delete on public.promotion_events to service_role;
grant select on public.promotion_packages to anon;
grant select on public.promotion_packages to authenticated;
grant select, insert, update, delete on public.promotion_packages to service_role;
grant select on public.promotion_prices to anon;
grant select on public.promotion_prices to authenticated;
grant select, insert, update, delete on public.promotion_prices to service_role;
grant select, insert, update, delete on public.public_profiles to anon;
grant select, insert, update, delete on public.public_profiles to authenticated;
grant select, insert, update, delete on public.public_profiles to service_role;
grant select on public.regions to anon;
grant select on public.regions to authenticated;
grant select, insert, update, delete on public.regions to service_role;
grant select, insert, update, delete on public.reports to anon;
grant select, insert, update, delete on public.reports to authenticated;
grant select, insert, update, delete on public.reports to service_role;
grant select, update on public.reviews to anon;
grant select on public.reviews to authenticated;
grant select, insert, update, delete on public.reviews to service_role;
grant update (seller_reply) on public.reviews to authenticated;
grant select, insert, update, delete on public.seller_follows to anon;
grant select, insert, update, delete on public.seller_follows to authenticated;
grant select, insert, update, delete on public.seller_follows to service_role;
grant select, insert, update, delete on public.seller_profiles to anon;
grant select, insert, update, delete on public.seller_profiles to authenticated;
grant select, insert, update, delete on public.seller_profiles to service_role;
grant select, insert, update, delete on public.seller_ratings to anon;
grant select, insert, update, delete on public.seller_ratings to authenticated;
grant select, insert, update, delete on public.seller_ratings to service_role;
grant select on public.seller_verifications to anon;
grant select on public.seller_verifications to authenticated;
grant select, insert, update, delete on public.seller_verifications to service_role;
grant select on public.subscription_plans to anon;
grant select on public.subscription_plans to authenticated;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select on public.subscriptions to anon;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;
grant select on public.user_roles to anon;
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.user_roles to service_role;

-- Sequences behind identity / serial columns (same as before: usage, select, update).
grant usage, select, update on all sequences in schema public to anon, authenticated, service_role;
