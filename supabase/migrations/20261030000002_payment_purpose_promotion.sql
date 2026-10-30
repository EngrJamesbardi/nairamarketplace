-- New payment purpose for paid listing promotions. Kept in its own migration: a new enum value cannot be used in the
-- same transaction that adds it.
alter type public.payment_purpose add value if not exists 'promotion';
