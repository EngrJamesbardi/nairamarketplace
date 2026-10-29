-- New-member count now excludes deleted accounts, consistent with the total member count.
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._require_staff();
  select jsonb_build_object(
    'users', (select count(*) from public.profiles where status <> 'deleted'),
    'users_7d', (select count(*) from public.profiles where status <> 'deleted' and created_at > now() - interval '7 days'),
    'sellers', (select count(*) from public.seller_profiles),
    'active_listings', (select count(*) from public.listings where status = 'active' and moderation_status = 'approved'),
    'listings_7d', (select count(*) from public.listings where created_at > now() - interval '7 days'),
    'pending_review', (select count(*) from public.listings where moderation_status = 'pending_review'),
    'open_reports', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'conversations_7d', (select count(*) from public.conversations where created_at > now() - interval '7 days'),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'offers_7d', (select count(*) from public.offers where created_at > now() - interval '7 days'),
    'accepted_offers_7d', (select count(*) from public.offers where status = 'accepted' and responded_at > now() - interval '7 days'),
    'pending_verifications', (select count(*) from public.seller_verifications where status = 'pending'),
    'by_country', (select coalesce(jsonb_object_agg(country_code, n), '{}') from (select country_code, count(*) n from public.listings where status = 'active' group by 1) x)
  ) into v;
  return v;
end $$;
