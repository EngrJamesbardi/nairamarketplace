# Architecture and security model

## Components

```
Browser (PWA) ──HTTPS──> Next.js server (App Router)
   │  anon key + user session            │ server-only service-role key (webhooks, deletion, counters, cron)
   └──── Supabase Realtime (websocket) ──┴──> Supabase: Postgres (RLS) · Auth · Storage · Realtime
                                                   ▲
Payment provider ──signed webhook──> /api/payments/webhook/[provider]
Scheduler ──Bearer CRON_SECRET──> /api/cron/maintenance
```

Pages are server-rendered with the member's own Supabase session, so Row Level Security decides what each request can read.
Mutations are server actions or same-origin POST route handlers that validate input with Zod and then call either a table write that
RLS allows or a database function.

## Database rules (supabase/migrations)

| Migration | Contents |
| --- | --- |
| 01 core_schema | countries, regions, profiles, roles, storefronts, categories, listings, images, view events; role helpers; column-protection triggers |
| 02 listing_rules | prohibited terms, country policies, settings, active-listing allowance, listing validation trigger, expiry/renewal, deduplicated view counting |
| 03 core_rls | RLS policies, public views (`listing_cards`, `public_profiles`), `search_listings()` |
| 04 storage_and_reference_data | image buckets with per-user folders and type/size limits; country, region and category data |
| 05 interaction | favourites, follows, blocks, notifications, conversations, messages, offers, reviews, reports and their functions |
| 06 profile_privacy | column-level grants so private profile fields are never selectable by others |
| 07 trust_admin | append-only audit log and moderation history, verification, admin functions, privacy (anonymise, retention) |
| 09 monetisation | credit packages, ledger, payments, payment events, plans, subscriptions, promotion prices, campaigns, events |
| 08/10/11 | foreign keys for embedding; stats fix |

Principles:

- **RLS everywhere.** Writes that need business rules (messages, offers, reviews, reports, credits, payments, promotions, moderation)
  are not granted on the tables at all; they go through `SECURITY DEFINER` functions that check `auth.uid()`, roles, blocks, rate limits
  and state, and write audit entries.
- **Protection triggers are `SECURITY INVOKER`** so they see the real caller (`is_service()`), and stop members editing moderation,
  verification, featuring, status or seed flags.
- **Offer state machine** (`make_offer`, `respond_offer`, `withdraw_offer`, `expire_offers`): only the other party can accept, reject or
  counter; a counter supersedes the previous offer; one pending offer per buyer and listing; amounts use the listing currency.
- **Reviews** are allowed only for a buyer with an accepted offer ("agreed price") or a confirmed sale ("verified"), once per conversation.
- **Audit log and moderation history** reject `UPDATE`/`DELETE` even for the table owner.

## Money

- Amounts are `bigint` minor units with a `char(3)` currency. Catalogue prices must match the market currency (trigger). Formatting uses
  `Intl.NumberFormat` with exact decimal strings (no floating point).
- **Credits ledger.** `credit_transactions` is append-only. Every row has a unique `idempotency_key`. `_apply_credits()` locks the
  account row, re-checks the key, refuses to go below zero and writes the ledger row and new balance together. It is not executable by
  clients. `credit_ledger_mismatches()` reconciles balances against the ledger (shown on the admin payments page).
- **Payments.** `start_checkout()` (member) creates a pending payment priced from the catalogue. Only `complete_payment()` (service role
  only) can mark it paid. It checks provider, amount and currency, is idempotent (`already_processed`), and grants credits or activates
  or extends the plan in the same transaction. The webhook route verifies the provider signature first; the return page only reads.
- **Promotions.** Flat credits per day, charged up front in the same transaction that creates the campaign; cancelling refunds whole
  unused days. Serving (`get_sponsored`) shows only live campaigns on visible listings, filtered by market, category and search terms, in
  random rotation, capped by `max_sponsored_per_page`, always labelled "Sponsored" and separate from organic results. Impressions require
  the card to be at least 50% on screen for one second; impressions and clicks are counted once per pseudonymous viewer per day, exclude
  the seller, and are recorded by the server (service role) so clients cannot inflate them directly. Because pricing is flat, inflated
  counts could not change what a seller pays.

## Payment providers (src/lib/payments)

`PaymentProvider` has `createCheckout()` and `parseWebhook()`. `getProvider(key)` returns a provider only if it is listed in
`PAYMENTS_ENABLED_PROVIDERS` **and** has its credentials. Each market chooses its provider in Admin > Countries.

- `mock`: development only. Hosted page `/pay/mock/[ref]`, HMAC-SHA256 signed webhook.
- `paystack`: written against Paystack's documented API (initialize, verify, `x-paystack-signature` HMAC-SHA512), and it re-verifies
  transactions via the API. **Not tested against Paystack**: it needs an account and keys.

## PWA

- `src/app/manifest.ts`: name, theme `#B84A24`, background `#FFF0E7`, standalone, any + maskable + monochrome icons, shortcuts.
- `public/sw.js`:
  - App code and icons are cache-first.
  - Public pages are network-first; the last copy is kept and labelled "saved copy" when offline.
  - Private routes, API calls and non-GET requests are never cached. Pages marked `x-nm-private` are never stored.
  - Unknown pages fall back to the static `/offline.html`.
  - A new version waits until the member taps "Update now".
  - Signing out clears saved pages.

## Rate limiting

- **Database (shared, authoritative):** messages, conversations, offers, reports, listings, checkouts and promotions (`assert_rate`, error `P0429`).
- **App level (in-memory, per instance):** sign-up, sign-in, password reset, data export, account deletion and promotion events. For
  multi-instance hosting, move these to a shared store (see DEPLOYMENT.md).
