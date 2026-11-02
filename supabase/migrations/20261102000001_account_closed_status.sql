-- Admin-closed accounts. Kept in its own migration because a new enum value can only be used once committed.
-- 'closed' differs from 'deactivated' (the member's own, reversible choice): only an administrator can reopen it,
-- and the app also bans the login so a closed member cannot sign in.
alter type public.account_status add value if not exists 'closed';
