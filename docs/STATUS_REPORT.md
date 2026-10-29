# Status report: completed, tested, mocked, incomplete

Date: 2026-10-29. Environment: a cloud development container running a **local** Supabase stack (Docker) and a production build of the
app (`next build && next start`). Nothing has been deployed publicly. No services have been purchased.

## Test results (final run, clean database)

| Suite | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Clean |
| Type check | `npm run typecheck` | Clean |
| Production build | `npm run build` | Succeeds |
| Unit (Vitest) | `npm test` | **23/23 passed**: money parsing/formatting, validation, payment-signature verification, provider registry |
| Database (pgTAP) | `npm run test:db` | **108/108 passed** across 5 files: RLS and column privacy, listing rules, messaging and offer state machine, reviews eligibility, blocking, reports, admin permissions and moderator limits, audit immutability, privacy deletion, ledger, payments idempotency, amount mismatch, promotions, refunds, plans |
| Concurrency | `npm run test:concurrency` | **Passed**: 4 parallel promotions against a 30-credit balance, only 1 succeeded and the balance never went negative; 6 parallel duplicate webhooks granted credits once; 0 ledger mismatches |
| End-to-end (Playwright, Chromium) | `npm run test:e2e` against the production build | **40 passed, 1 skipped** (a phone-only check skipped on desktop). Two device profiles: Pixel 7 (all 26 tests) and desktop Chrome (15 PWA, layout and admin tests) |

The end-to-end suite covers:

- **Browsing:** guest browse, search, filters, country switching, and protected-route redirects.
- **Account and selling:** register, email verification (Mailpit), storefront creation, publishing a listing with a photo, pausing and
  reactivating it.
- **Negotiation:** buyer to seller messaging with realtime delivery, offer, counter-offer and acceptance, a review after acceptance, and
  conversation privacy.
- **Admin:** a member blocked from admin, every admin page loading, and a suspension that hides the shop, is audit-logged and is reversed.
- **Privacy:** data export, deactivation, reactivation and account deletion.
- **Credits and plans:**
  - credits are not granted from a bare return URL
  - a successful mock payment grants credits once
  - a declined payment grants nothing
  - promotion, sponsored display to a guest with a real impression and click counted, and cancellation with refund
  - plan upgrade raises the listing allowance
- **PWA:**
  - manifest, icons, theme colour and service-worker control
  - offline saved copy and offline fallback; private pages never cached
  - updates only after the user taps "Update now"
- **Layout and accessibility:**
  - no sideways scrolling on public and seller pages; tap targets of 44px or more
  - axe-core WCAG 2.1 A/AA with no serious or critical issues on 15 pages, plus a dark-mode contrast check

### Bugs found by testing and fixed

- Offline fallback page crashed: it tried to load app code that wasn't cached. Now a static `offline.html`.
- Header icons overflowed phones for signed-in sellers (CSS display conflict).
- Chat opened scrolled past the messages to the footer.
- Logo and notification link names didn't match their visible text (accessibility).
- Warning text contrast and "Demo" badges unreadable in dark mode.
- Offer badges unreadable inside the member's own message bubble.
- Admin "new members" count included deleted accounts.
- Admin form submissions were sometimes lost on phones right after page load. Admin forms now post as plain forms.

### Known intermittent issue

In about 1 in 20 runs, a listing-publish test did not follow the post-save redirect on the phone profile; the listing itself was saved.
This is the same Next.js server-action redirect behaviour that affected admin forms (fixed by plain-form posting). The publish form
still uses a server action. **Risk:** a member might see the form stay on screen after saving and submit it twice. Suggested fix: the
same plain-POST pattern, or a client-side redirect fallback.

## Completed and tested locally

- **Auth and access:**
  - email/password with mandatory email verification, password reset and change
  - sign-in, sign-up and reset rate limits
  - roles; suspension (with a dedicated page), deactivation and self-deletion
- **Markets:**
  - NG and GH active; KE and ZA configured but inactive
  - currency per market, enforced on listings, offers and catalogue prices
  - regions, phone normalisation, country cookie, cross-border discovery switch
- **Listings:**
  - storefront onboarding, listing create/edit, drafts and lifecycle actions, expiry and renewal
  - photo upload (compressed on the device, magic-byte check on the server, 5 MB, 8 photos)
  - category attributes, prohibited and restricted terms
  - free active-listing allowance
- **Discovery:** search with relevance, typo tolerance, filters and sorting; homepage sections; storefront pages; deduplicated view
  counts.
- **Negotiation:**
  - realtime messaging with polling fallback; link warnings
  - offers with the full state machine (expiry via the scheduled job)
  - favourites, follows with notifications, blocking, reports
  - reviews with eligibility rules
- **Admin:** stats, moderation queue, reports, users, verifications, countries, categories, policies and settings, packages and
  promotion prices, campaigns, plans, payments and revenue with ledger reconciliation, append-only audit log.
- **Monetisation:**
  - immutable, idempotent ledger with balance checks under row locks
  - checkout, webhook verification and completion; amount and currency checks
  - promotions with labelled, capped, relevance-filtered sponsored slots and real de-duplicated metrics
  - plans that raise the listing allowance and grant credits; admin credit adjustments (idempotent, audited)
- **PWA:** manifest, generated icons (any, maskable, monochrome, Apple), service worker with safe caching rules, offline fallback,
  user-approved updates, install page.
- **Design:** brand tokens (light default, separate dark palette), mobile-first layouts with a bottom tab bar on phones.

## Mocked (clearly labelled)

- **Payments:** the `mock` provider is the only working provider. Its checkout page says "Development mock checkout. No real money moves."
  It sends a properly signed webhook through the same verification and ledger path a real provider would use.
- **Seed data:** 5 demo accounts, 4 storefronts and 10 listings marked "(Demo)" with illustrated placeholder images and "Demo" badges.
  No fabricated reviews, sales or analytics are seeded. Counts shown come from real activity in the local database.
- **Email:** captured locally by Mailpit.

## Implemented but not tested or not configured

- **Paystack adapter** (`src/lib/payments/paystack.ts`): needs an account and keys; never exercised against Paystack.
- **Scheduled maintenance:** the endpoint is tested locally, but no scheduler is set up.
- **Bootstrap admin script:** tested locally.

## Incomplete or not built

- Phone number verification (no SMS provider); numbers are marked unverified.
- Automatic subscription renewal (plans are paid per period and do not auto-charge; this is deliberate until payment consent flows
  are designed).
- Refund handling for platform payments (the `refunded` status exists, but there is no provider-driven flow or admin action).
- Document upload for business verification (sellers submit registration details; staff verify against registries).
- Removing photos from storage after account deletion or archive.
- Languages other than English (strings are centralised in `src/i18n` for translation).
- Push notifications (in-app notifications only).
- A shared rate-limit store for multi-instance hosting, error monitoring, and backups automation.
- Legal texts are drafts awaiting lawyer review.
- Lighthouse and performance budgets on real low-end devices and 3G networks have not been measured.
- iOS Safari and Firefox were not tested (Chromium only).
