# Naira Marketplace

**Africa's Open Market. Your Deals, Your Way.**

A mobile-first, installable web app (PWA) where people in Nigeria, Ghana, Kenya and South Africa list items, find each other, message
and negotiate. Buyers and sellers agree price, payment and delivery directly. The platform does not hold product payments, deliver goods
or take commissions. Revenue comes only from optional seller tools: promotion credits and seller plans.

> Status: feature-complete for local use and tested locally. **Not yet production-ready.** See
> [docs/STATUS_REPORT.md](docs/STATUS_REPORT.md) and [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

## What's inside

| Area | Highlights |
| --- | --- |
| Accounts | Email + password with email verification, password reset, rate limiting, roles (member, seller, moderator, admin), suspension, deactivation, self-service deletion and data export |
| Markets | Countries, currencies, regions, phone formats and policies are data. NG and GH are active; KE and ZA are configured but inactive. Money is stored as integer minor units with its currency and never converted |
| Listings | Storefronts, listings with photos (compressed on the device, type-checked on the server), category attributes, drafts, pause/reserve/sold/renew, expiry, prohibited-term blocking and review holds |
| Discovery | Full-text + typo-tolerant search, filters (category, region, price, condition, delivery, distance), sort, recently listed, popular, near you, featured sellers |
| Negotiation | Real-time messaging (with polling fallback), link warnings, offers and counter-offers with an enforced state machine (pending, accepted, rejected, countered, withdrawn, expired) |
| Trust | Favourites, follows, blocking, reports, reviews only after an accepted offer or confirmed sale, seller business verification, moderation queue, append-only audit log |
| Money | Immutable, idempotent credits ledger; promotions with clearly labelled sponsored slots and real de-duplicated impressions/clicks; optional paid promotion when publishing (₦2,000 / 7 days, ₦5,000 / 30 days in Nigeria, activated only by a verified payment); free allowance of 15 active listings, higher with seller plans; payment-provider abstraction with a development mock and a Paystack adapter (not yet configured) |
| Locations | All 36 Nigerian states + FCT and 774 LGAs with dependent selects in listing forms, homepage and search; Ghana's 16 regions; second-level areas are per market and optional |
| PWA | Manifest + icons, service worker with offline fallback, saved copies of public pages, private pages never cached, user-approved updates |
| Admin | Overview stats, listing moderation, reports, users, verifications, countries (free listing allowance), categories (photos needed to publish), policies, credit packages, promotion prices, paid promotion packages, active/expired promotions, plans, payments/revenue, audit log |

Screenshots of the local flows: [docs/DEMO.md](docs/DEMO.md).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Realtime) · Zod ·
Vitest · pgTAP · Playwright (+ axe-core).

## Run it locally

Requirements: Node 20+, Docker (for the local Supabase stack).

```bash
npm install
npx supabase start            # starts Postgres, Auth, Storage, Realtime and Mailpit in Docker
cp .env.example .env.local    # then paste the anon + service-role keys printed by `npx supabase status`
npm run db:reset              # applies migrations + seed data
npm run dev                   # http://localhost:3000
```

Emails (verification, password reset) are caught by Mailpit at http://127.0.0.1:54324.

Demo accounts from `supabase/seed.sql` (password `Password123!`). All seed data is marked "Demo" in the UI.

| Email | Role |
| --- | --- |
| admin@naira.test | Administrator |
| chioma@naira.test | Seller (Lagos, NG) |
| tunde@naira.test | Seller (Abuja, NG) |
| kwame@naira.test | Seller (Accra, GH) |
| buyer@naira.test | Buyer |

Payments use the **development mock** locally (`PAYMENTS_ENABLED_PROVIDERS=mock`): checkout opens a clearly labelled mock page that
sends a signed webhook to the app. No real money moves. Set `MOCK_PAYMENT_WEBHOOK_SECRET` to 16+ random characters (the
`.env.example` placeholder is rejected). A production build (`npm run build && npm start`, used by the end-to-end tests) also needs
`ALLOW_MOCK_PAYMENTS=true` in `.env.local`. Never set that on a public deployment.

## Tests

```bash
npm run lint && npm run typecheck
npm test                      # unit tests (money, validation, payment signatures)
npm run test:db               # pgTAP: RLS, permissions, state machines, ledger, admin/audit
npm run build && npm start    # end-to-end tests run against a production build
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
npm run test:concurrency      # parallel double-spend / duplicate-webhook checks (writes ledger rows; reset afterwards)
```

Latest results are recorded in [docs/STATUS_REPORT.md](docs/STATUS_REPORT.md).

## Project layout

```
src/app/            routes (pages, server actions, API routes); admin/ is the admin dashboard
src/components/     shared UI
src/lib/            supabase clients, auth guards, money, validation, payments/, promotions, rate limiting
supabase/migrations schema, RLS, functions, reference data (applied in order)
supabase/seed.sql   demo data (local only)
supabase/tests/     pgTAP database tests
tests/unit|e2e|db   Vitest, Playwright and concurrency tests
public/sw.js        service worker; public/offline.html offline fallback
docs/               deployment, external services, privacy, status and readiness
```

## Security model (summary)

- Row Level Security on every table. The browser only ever has the anon key and the user's session.
- Anything privileged (offers, messages, moderation, credits, payments) is a database function that re-checks the caller and writes the
  audit log. Clients cannot write money tables at all.
- The service-role key is used only in server code (`src/lib/supabase/admin.ts`, marked `server-only`): payment webhooks, account deletion,
  sponsored-event counting and scheduled maintenance.
- Credits are granted **only** by `complete_payment()`, executable by the service role alone, after the webhook signature is verified and
  the amount and currency match. Return URLs only read status.
- Admin forms post to a same-origin route handler; auth cookies are `SameSite=Lax`.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): deploying, environment variables, scheduled jobs, backups and restore
- [docs/EXTERNAL_SERVICES.md](docs/EXTERNAL_SERVICES.md): every external service, whether it is needed, and its status
- [docs/PRIVACY_AND_COMPLIANCE.md](docs/PRIVACY_AND_COMPLIANCE.md): data map, retention, data-subject rights, legal review items
- [docs/ADDING_A_COUNTRY.md](docs/ADDING_A_COUNTRY.md): opening a new market
- [docs/STATUS_REPORT.md](docs/STATUS_REPORT.md): what is completed, tested, mocked and incomplete
- [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md): launch checklist
