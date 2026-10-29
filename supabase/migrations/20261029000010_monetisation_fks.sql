-- Lets PostgREST embed the seller's storefront on campaigns (every promoter has a storefront).
alter table public.promotion_campaigns
  add constraint promotion_campaigns_seller_shop_fkey foreign key (seller_id) references public.seller_profiles(user_id);
