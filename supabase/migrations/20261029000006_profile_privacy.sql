-- Public vs private profile columns.
-- Everyone may read a member's public identity (name, avatar, general location); private columns
-- (phone, preferences, moderation fields) are only reachable through get_my_profile() or staff RPCs.

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_public on public.profiles for select using (true);

revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url, bio, country_code, city, status, is_seed, created_at) on public.profiles to anon, authenticated;

create or replace function public.get_my_profile()
returns public.profiles language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke execute on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- Lets PostgREST embed the seller's storefront on a conversation.
alter table public.conversations
  add constraint conversations_seller_shop_fkey foreign key (seller_id) references public.seller_profiles(user_id);
