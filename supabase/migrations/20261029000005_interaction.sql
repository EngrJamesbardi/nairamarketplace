-- Phase 2: direct buyer-seller interaction — favourites, follows, blocking, conversations, messages,
-- offers (server-enforced state machine), reviews, reports and notifications.

create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'expired');
create type public.report_reason as enum ('prohibited_item', 'scam_or_fraud', 'counterfeit', 'misleading', 'offensive', 'harassment', 'spam', 'wrong_category', 'other');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Rate-limit helper (counts recent rows; raises a friendly error).
-- ---------------------------------------------------------------------------
create or replace function public.assert_rate(p_count bigint, p_limit integer, p_what text)
returns void language plpgsql as $$
begin
  if p_count >= p_limit then
    raise exception 'Too many % in a short time. Please wait a little and try again.', p_what using errcode = 'P0429';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Favourites & follows & blocks
-- ---------------------------------------------------------------------------
create table public.favourites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index favourites_listing_idx on public.favourites(listing_id);

create table public.seller_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, seller_id),
  check (follower_id <> seller_id)
);
create index seller_follows_seller_idx on public.seller_follows(seller_id);

create table public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocked_users where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.favourite_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set favourite_count = favourite_count + 1 where id = new.listing_id;
  else
    update public.listings set favourite_count = greatest(favourite_count - 1, 0) where id = old.listing_id;
  end if;
  return null;
end $$;
create trigger favourites_count after insert or delete on public.favourites for each row execute function public.favourite_counter();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,  -- message | offer | follow | listing_update | review | moderation | system | payment
  title text not null,
  body text,
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

-- Creates an in-app notification if the recipient's preferences allow that category.
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pref_key text := case p_kind when 'message' then 'messages' when 'offer' then 'offers' when 'follow' then 'follows'
                                 when 'listing_update' then 'listing_updates' else null end;
  v_prefs jsonb;
begin
  select notification_prefs into v_prefs from public.profiles where id = p_user and status in ('active', 'suspended');
  if not found then return; end if;
  if v_pref_key is not null and coalesce((v_prefs ->> v_pref_key)::boolean, true) = false then return; end if;
  insert into public.notifications(user_id, kind, title, body, link, data)
  values (p_user, p_kind, left(p_title, 140), left(p_body, 300), p_link, coalesce(p_data, '{}'));
end $$;
revoke execute on function public.notify(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.seller_id, 'follow', 'You have a new follower',
    (select display_name from public.profiles where id = new.follower_id) || ' followed your shop', '/dashboard', '{}');
  return null;
end $$;
create trigger seller_follows_notify after insert on public.seller_follows for each row execute function public.on_follow();

-- Notify followers when a followed seller publishes a new listing.
create or replace function public.on_listing_published()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'active' and new.moderation_status = 'approved' and not new.is_seed
     and (tg_op = 'INSERT' or old.status = 'draft' or old.moderation_status <> 'approved') then
    for r in select follower_id from public.seller_follows where seller_id = new.seller_id limit 5000 loop
      perform public.notify(r.follower_id, 'listing_update', 'New from a shop you follow', new.title, '/listing/' || new.id, jsonb_build_object('listing_id', new.id));
    end loop;
  end if;
  return null;
end $$;
create trigger listings_notify_followers after insert or update of status, moderation_status on public.listings
  for each row execute function public.on_listing_published();

-- ---------------------------------------------------------------------------
-- Conversations & messages
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create unique index conversations_unique_listing_buyer on public.conversations(listing_id, buyer_id) where listing_id is not null;
create index conversations_buyer_idx on public.conversations(buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations(seller_id, last_message_at desc);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('buyer', 'seller')),
  last_read_at timestamptz,
  archived_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants(user_id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  parent_offer_id uuid references public.offers(id) on delete set null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  quantity integer not null default 1 check (quantity between 1 and 100000),
  note text check (char_length(note) <= 500),
  status public.offer_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '48 hours',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (proposed_by in (buyer_id, seller_id))
);
create index offers_listing_idx on public.offers(listing_id, status);
create index offers_conversation_idx on public.offers(conversation_id, created_at);
create index offers_buyer_idx on public.offers(buyer_id, created_at desc);
create index offers_seller_idx on public.offers(seller_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'offer', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  offer_id uuid references public.offers(id) on delete set null,
  has_link boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);
create index messages_sender_recent_idx on public.messages(sender_id, created_at desc);

create or replace function public.is_participant(p_conversation uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_participants where conversation_id = p_conversation and user_id = p_user);
$$;

-- Internal: append a message, update conversation, notify the other party.
create or replace function public._post_message(p_conversation uuid, p_sender uuid, p_kind text, p_body text, p_offer uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_conv public.conversations%rowtype;
  v_other uuid;
  v_has_link boolean := p_body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|xyz|top|info|link|ly|io|ng|gh|ke|za)\M)';
begin
  select * into v_conv from public.conversations where id = p_conversation;
  insert into public.messages(conversation_id, sender_id, kind, body, offer_id, has_link)
  values (p_conversation, p_sender, p_kind, p_body, p_offer, v_has_link) returning id into v_id;
  update public.conversations set last_message_at = now(), last_message_preview = left(p_body, 120) where id = p_conversation;
  update public.conversation_participants set last_read_at = now(), archived_at = null where conversation_id = p_conversation and user_id = p_sender;
  update public.conversation_participants set archived_at = null where conversation_id = p_conversation;
  v_other := case when p_sender = v_conv.buyer_id then v_conv.seller_id else v_conv.buyer_id end;
  if p_sender is not null then
    perform public.notify(v_other, case when p_kind = 'offer' then 'offer' else 'message' end,
      case when p_kind = 'offer' then 'Offer update' else 'New message' end,
      left(p_body, 140), '/messages/' || p_conversation, jsonb_build_object('conversation_id', p_conversation));
  end if;
  return v_id;
end $$;
revoke execute on function public._post_message(uuid, uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public._assert_can_interact(p_user uuid, p_other uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not public.is_active_user(p_user) then raise exception 'Your account cannot send messages right now' using errcode = '42501'; end if;
  if not public.is_active_user(p_other) then raise exception 'This member is not available' using errcode = '42501'; end if;
  if public.is_blocked_between(p_user, p_other) then raise exception 'You cannot contact this member' using errcode = '42501'; end if;
end $$;

-- Start (or reuse) a conversation about a listing and post the first message.
create or replace function public.start_conversation(p_listing uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_conv uuid;
begin
  select * into v_listing from public.listings where id = p_listing;
  if not found or v_listing.moderation_status <> 'approved' or v_listing.status not in ('active', 'reserved') then
    raise exception 'This listing is not available' using errcode = 'P0002';
  end if;
  if v_listing.seller_id = v_me then raise exception 'You cannot message yourself' using errcode = '22023'; end if;
  perform public._assert_can_interact(v_me, v_listing.seller_id);
  p_body := trim(p_body);
  if p_body is null or char_length(p_body) = 0 or char_length(p_body) > 2000 then
    raise exception 'Message must be between 1 and 2000 characters' using errcode = '22023';
  end if;

  select id into v_conv from public.conversations where listing_id = p_listing and buyer_id = v_me;
  if v_conv is null then
    perform public.assert_rate((select count(*) from public.conversations where buyer_id = v_me and created_at > now() - interval '1 hour'), 30, 'new conversations');
    insert into public.conversations(listing_id, buyer_id, seller_id) values (p_listing, v_me, v_listing.seller_id) returning id into v_conv;
    insert into public.conversation_participants(conversation_id, user_id, role) values (v_conv, v_me, 'buyer'), (v_conv, v_listing.seller_id, 'seller');
    update public.listings set message_count = message_count + 1 where id = p_listing;
  end if;
  perform public.assert_rate((select count(*) from public.messages where sender_id = v_me and created_at > now() - interval '1 minute'), 20, 'messages');
  perform public._post_message(v_conv, v_me, 'text', p_body);
  return v_conv;
end $$;

create or replace function public.send_message(p_conversation uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_conv public.conversations%rowtype;
begin
  select * into v_conv from public.conversations where id = p_conversation;
  if not found or not public.is_participant(p_conversation, v_me) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  perform public._assert_can_interact(v_me, case when v_me = v_conv.buyer_id then v_conv.seller_id else v_conv.buyer_id end);
  p_body := trim(p_body);
  if p_body is null or char_length(p_body) = 0 or char_length(p_body) > 2000 then
    raise exception 'Message must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  perform public.assert_rate((select count(*) from public.messages where sender_id = v_me and created_at > now() - interval '1 minute'), 20, 'messages');
  return public._post_message(p_conversation, v_me, 'text', p_body);
end $$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language sql security definer set search_path = public as $$
  update public.conversation_participants set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid();
$$;

create or replace function public.unread_message_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.messages m
  join public.conversation_participants p on p.conversation_id = m.conversation_id and p.user_id = auth.uid()
  where m.sender_id is distinct from auth.uid() and (p.last_read_at is null or m.created_at > p.last_read_at);
$$;

-- ---------------------------------------------------------------------------
-- Offers: valid transitions are enforced here, never in the client.
--   pending -> accepted | rejected | countered   (by the party who did NOT propose)
--   pending -> withdrawn                          (by the proposer)
--   pending -> expired                            (time-based)
-- An accepted offer records an agreed price only; it is not a payment or delivery.
-- ---------------------------------------------------------------------------
create or replace function public._expire_if_due(p_offer uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.offers set status = 'expired', responded_at = now()
  where id = p_offer and status = 'pending' and expires_at <= now();
  return found;
end $$;
revoke execute on function public._expire_if_due(uuid) from public, anon, authenticated;

create or replace function public.make_offer(p_listing uuid, p_amount_minor bigint, p_quantity integer default 1, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_conv uuid;
  v_offer uuid;
begin
  select * into v_listing from public.listings where id = p_listing;
  if not found or v_listing.moderation_status <> 'approved' or v_listing.status <> 'active' then
    raise exception 'This listing is not accepting offers' using errcode = 'P0002';
  end if;
  if v_listing.seller_id = v_me then raise exception 'You cannot make an offer on your own listing' using errcode = '22023'; end if;
  perform public._assert_can_interact(v_me, v_listing.seller_id);
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'Enter a valid offer amount' using errcode = '22023'; end if;
  if p_quantity is null or p_quantity < 1 or (v_listing.quantity > 0 and p_quantity > v_listing.quantity) then
    raise exception 'Requested quantity is not available' using errcode = '22023';
  end if;
  perform public.assert_rate((select count(*) from public.offers where proposed_by = v_me and created_at > now() - interval '1 hour'), 15, 'offers');
  if exists (select 1 from public.offers where listing_id = p_listing and buyer_id = v_me and status = 'pending' and expires_at > now()) then
    raise exception 'You already have a pending offer on this listing. Withdraw it or wait for a reply.' using errcode = '23505';
  end if;

  select id into v_conv from public.conversations where listing_id = p_listing and buyer_id = v_me;
  if v_conv is null then
    insert into public.conversations(listing_id, buyer_id, seller_id) values (p_listing, v_me, v_listing.seller_id) returning id into v_conv;
    insert into public.conversation_participants(conversation_id, user_id, role) values (v_conv, v_me, 'buyer'), (v_conv, v_listing.seller_id, 'seller');
    update public.listings set message_count = message_count + 1 where id = p_listing;
  end if;

  insert into public.offers(listing_id, conversation_id, buyer_id, seller_id, proposed_by, amount_minor, currency, quantity, note)
  values (p_listing, v_conv, v_me, v_listing.seller_id, v_me, p_amount_minor, v_listing.currency, p_quantity, left(trim(p_note), 500))
  returning id into v_offer;
  perform public._post_message(v_conv, v_me, 'offer', 'Made an offer', v_offer);
  return v_offer;
end $$;

create or replace function public.respond_offer(p_offer uuid, p_action text, p_counter_amount_minor bigint default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_new uuid;
  v_label text;
begin
  if p_action not in ('accept', 'reject', 'counter') then raise exception 'Invalid action' using errcode = '22023'; end if;
  select * into v_offer from public.offers where id = p_offer for update;
  if not found or v_me not in (v_offer.buyer_id, v_offer.seller_id) then
    raise exception 'Offer not found' using errcode = 'P0002';
  end if;
  if v_offer.status = 'pending' and v_offer.expires_at <= now() then
    perform public._expire_if_due(p_offer);
    raise exception 'This offer has expired' using errcode = 'P0409';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is already %', v_offer.status using errcode = 'P0409';
  end if;
  if v_offer.proposed_by = v_me then
    raise exception 'You cannot respond to your own offer' using errcode = '42501';
  end if;
  perform public._assert_can_interact(v_me, v_offer.proposed_by);

  if p_action = 'accept' then
    update public.offers set status = 'accepted', responded_at = now() where id = p_offer;
    v_label := 'Accepted the offer. Agree payment and delivery directly.';
  elsif p_action = 'reject' then
    update public.offers set status = 'rejected', responded_at = now() where id = p_offer;
    v_label := 'Declined the offer';
  else
    if p_counter_amount_minor is null or p_counter_amount_minor <= 0 then
      raise exception 'Enter a valid counter-offer amount' using errcode = '22023';
    end if;
    update public.offers set status = 'countered', responded_at = now() where id = p_offer;
    insert into public.offers(listing_id, conversation_id, buyer_id, seller_id, proposed_by, parent_offer_id, amount_minor, currency, quantity, note)
    values (v_offer.listing_id, v_offer.conversation_id, v_offer.buyer_id, v_offer.seller_id, v_me, p_offer,
            p_counter_amount_minor, v_offer.currency, v_offer.quantity, left(trim(p_note), 500))
    returning id into v_new;
    v_label := 'Sent a counter-offer';
  end if;
  perform public._post_message(v_offer.conversation_id, v_me, 'offer', v_label, coalesce(v_new, p_offer));
  return coalesce(v_new, p_offer);
end $$;

create or replace function public.withdraw_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_offer public.offers%rowtype;
begin
  select * into v_offer from public.offers where id = p_offer for update;
  if not found or v_offer.proposed_by is distinct from v_me then
    raise exception 'Offer not found' using errcode = 'P0002';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'Only pending offers can be withdrawn (this one is %)', v_offer.status using errcode = 'P0409';
  end if;
  update public.offers set status = 'withdrawn', responded_at = now() where id = p_offer;
  perform public._post_message(v_offer.conversation_id, v_me, 'offer', 'Withdrew the offer', p_offer);
end $$;

create or replace function public.expire_offers()
returns integer language sql security definer set search_path = public as $$
  with x as (update public.offers set status = 'expired', responded_at = now()
             where status = 'pending' and expires_at <= now() returning 1)
  select count(*)::int from x;
$$;
revoke execute on function public.expire_offers() from public, anon, authenticated;

-- Seller marks a listing sold, optionally to a buyer they have a conversation with (enables a verified review).
create or replace function public.mark_listing_sold(p_listing uuid, p_buyer uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_listing public.listings%rowtype;
begin
  select * into v_listing from public.listings where id = p_listing for update;
  if not found or v_listing.seller_id is distinct from auth.uid() then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  if p_buyer is not null and not exists (select 1 from public.conversations where listing_id = p_listing and buyer_id = p_buyer) then
    raise exception 'The buyer must have contacted you about this listing' using errcode = '22023';
  end if;
  update public.listings set status = 'sold', sold_to = p_buyer where id = p_listing;
  if p_buyer is not null then
    perform public.notify(p_buyer, 'listing_update', 'Seller marked your purchase as sold', v_listing.title || ' — you can now leave a review', '/listing/' || p_listing, '{}');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reviews (explicit eligibility policy)
--   Eligible: a buyer whose offer on the listing was ACCEPTED, or whom the seller marked as the buyer.
--   verified_transaction = seller confirmed the sale to this buyer. Otherwise it is an "agreed-price"
--   interaction and is labelled as unverified. One review per buyer per listing. Sellers cannot review themselves.
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 1000),
  verified_transaction boolean not null default false,
  status text not null default 'published' check (status in ('published', 'hidden')),
  seller_reply text check (char_length(seller_reply) <= 1000),
  created_at timestamptz not null default now(),
  unique (reviewer_id, listing_id),
  check (reviewer_id <> seller_id)
);
create index reviews_seller_idx on public.reviews(seller_id, created_at desc);

create or replace function public.review_eligibility(p_listing uuid, p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.listings where id = p_listing and sold_to = p_user) then 'verified'
    when exists (select 1 from public.offers where listing_id = p_listing and buyer_id = p_user and status = 'accepted') then 'agreed_price'
    else 'ineligible' end;
$$;

create or replace function public.submit_review(p_listing uuid, p_rating integer, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_elig text := public.review_eligibility(p_listing, v_me);
  v_seller uuid;
  v_id uuid;
begin
  if v_elig = 'ineligible' then
    raise exception 'You can review a seller after they accept your offer or confirm your purchase' using errcode = '42501';
  end if;
  if not public.is_active_user(v_me) then raise exception 'Account not active' using errcode = '42501'; end if;
  select seller_id into v_seller from public.listings where id = p_listing;
  insert into public.reviews(listing_id, seller_id, reviewer_id, rating, body, verified_transaction)
  values (p_listing, v_seller, v_me, p_rating, nullif(left(trim(p_body), 1000), ''), v_elig = 'verified')
  on conflict (reviewer_id, listing_id) do update set rating = excluded.rating, body = excluded.body,
     verified_transaction = excluded.verified_transaction
  returning id into v_id;
  perform public.notify(v_seller, 'review', 'You received a review', p_rating || '★', '/dashboard', '{}');
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('listing', 'user', 'message', 'review')),
  listing_id uuid references public.listings(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  review_id uuid references public.reviews(id) on delete set null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  country_code char(2) references public.countries(code),
  status public.report_status not null default 'open',
  resolution_note text,
  handled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_status_idx on public.reports(status, created_at);
create index reports_listing_idx on public.reports(listing_id);
create index reports_user_idx on public.reports(reported_user_id);

create or replace function public.report_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_service() then return new; end if;
  new.reporter_id := auth.uid();
  new.status := 'open'; new.resolution_note := null; new.handled_by := null; new.resolved_at := null;
  perform public.assert_rate((select count(*) from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour'), 10, 'reports');
  if new.target_type = 'listing' and new.listing_id is null then raise exception 'listing_id required' using errcode = '22023'; end if;
  if new.target_type = 'user' and new.reported_user_id is null then raise exception 'reported_user_id required' using errcode = '22023'; end if;
  if new.target_type = 'message' then
    if new.message_id is null then raise exception 'message_id required' using errcode = '22023'; end if;
    -- you can only report messages you can see (i.e. in your own conversations)
    if not exists (select 1 from public.messages m where m.id = new.message_id and public.is_participant(m.conversation_id)) then
      raise exception 'Message not found' using errcode = 'P0002';
    end if;
    select sender_id into new.reported_user_id from public.messages where id = new.message_id;
  end if;
  if new.listing_id is not null then
    select seller_id, country_code into new.reported_user_id, new.country_code from public.listings where id = new.listing_id;
  end if;
  if new.reported_user_id = auth.uid() then raise exception 'You cannot report yourself' using errcode = '22023'; end if;
  return new;
end $$;
create trigger reports_before_insert before insert on public.reports for each row execute function public.report_before_insert();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.favourites enable row level security;
alter table public.seller_follows enable row level security;
alter table public.blocked_users enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.offers enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

create policy favourites_own on public.favourites for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user(auth.uid()));
create policy follows_read on public.seller_follows for select using (true);
create policy follows_own_insert on public.seller_follows for insert with check (follower_id = auth.uid() and public.is_active_user(auth.uid()));
create policy follows_own_delete on public.seller_follows for delete using (follower_id = auth.uid());
create policy blocks_own on public.blocked_users for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy notifications_own_read on public.notifications for select using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete using (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Conversations/messages/offers: participants read; all writes go through the functions above.
create policy conversations_participant_read on public.conversations for select using (public.is_participant(id) or public.is_staff());
create policy participants_read on public.conversation_participants for select using (public.is_participant(conversation_id) or public.is_staff());
create policy participants_update_own on public.conversation_participants for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.conversation_participants from authenticated;
grant update (archived_at) on public.conversation_participants to authenticated;
create policy messages_participant_read on public.messages for select using (public.is_participant(conversation_id) or public.is_staff());
create policy offers_participant_read on public.offers for select using (auth.uid() in (buyer_id, seller_id) or public.is_staff());

create policy reviews_public_read on public.reviews for select using (status = 'published' or reviewer_id = auth.uid() or seller_id = auth.uid() or public.is_staff());
create policy reviews_seller_reply on public.reviews for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());
revoke update on public.reviews from authenticated;
grant update (seller_reply) on public.reviews to authenticated;

create policy reports_insert on public.reports for insert with check (auth.uid() is not null);
create policy reports_read_own on public.reports for select using (reporter_id = auth.uid() or public.is_staff());

revoke insert, update, delete on public.conversations, public.messages, public.offers from authenticated, anon;
revoke insert, delete on public.conversation_participants, public.reviews from authenticated, anon;

grant execute on function public.start_conversation(uuid, text), public.send_message(uuid, text), public.mark_conversation_read(uuid),
  public.unread_message_count(), public.make_offer(uuid, bigint, integer, text), public.respond_offer(uuid, text, bigint, text),
  public.withdraw_offer(uuid), public.mark_listing_sold(uuid, uuid), public.submit_review(uuid, integer, text),
  public.review_eligibility(uuid, uuid) to authenticated;
revoke execute on function public.start_conversation(uuid, text), public.send_message(uuid, text), public.make_offer(uuid, bigint, integer, text),
  public.respond_offer(uuid, text, bigint, text), public.withdraw_offer(uuid), public.mark_listing_sold(uuid, uuid),
  public.submit_review(uuid, integer, text) from anon;

-- Seller rating summary for storefronts.
create view public.seller_ratings with (security_invoker = true) as
  select seller_id, count(*)::int as review_count, round(avg(rating)::numeric, 1) as avg_rating,
         count(*) filter (where verified_transaction)::int as verified_count
  from public.reviews where status = 'published' group by seller_id;
grant select on public.seller_ratings to anon, authenticated;

-- Realtime for live chat + notifications (RLS still applies to subscribers).
alter publication supabase_realtime add table public.messages, public.notifications, public.offers;

-- Listing insert rate limit (spam control).
create or replace function public.listing_insert_rate()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then return new; end if;
  perform public.assert_rate((select count(*) from public.listings where seller_id = new.seller_id and created_at > now() - interval '1 hour'), 20, 'new listings');
  return new;
end $$;
create trigger listings_insert_rate before insert on public.listings for each row execute function public.listing_insert_rate();
