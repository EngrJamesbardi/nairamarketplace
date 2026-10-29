-- Every listing belongs to a storefront (enforced at insert); this FK lets PostgREST embed the shop.
alter table public.listings
  add constraint listings_seller_shop_fkey foreign key (seller_id) references public.seller_profiles(user_id);
