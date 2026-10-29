# Production-readiness checklist

The app is **not production-ready yet**. Status key: ✅ done and tested locally · 🟡 built, needs configuration or verification ·
⬜ not done.

## Infrastructure

- ⬜ Hosted Supabase project (paid tier for backups), schema pushed with `supabase db push`, seed **not** loaded
- ⬜ App hosting with HTTPS on the production domain; `NEXT_PUBLIC_SITE_URL` set
- ⬜ Custom SMTP with SPF/DKIM; test verification and reset emails reach Gmail and Yahoo inboxes
- ⬜ Daily scheduler calling `/api/cron/maintenance` with `CRON_SECRET`
- ⬜ Shared rate-limit store if running more than one instance
- ⬜ Error monitoring and uptime alerts
- ⬜ Backups: provider backups, an independent encrypted `pg_dump` and storage sync; **restore drill done and timed**

## Security

- ✅ RLS on all tables; privileged writes only via checked database functions (pgTAP: 108 passing)
- ✅ Service-role key only in server-only code; secrets not in the client bundle
- ✅ Webhook signature verification; idempotent payment completion; amount and currency checks; concurrency test
- ✅ Security headers (HSTS, nosniff, frame-deny, referrer, permissions policy)
- ⬜ Content-Security-Policy header (not yet set; needs nonce support for Next.js inline scripts)
- 🟡 `PAYMENTS_ENABLED_PROVIDERS` must **not** include `mock` in production; `RATE_LIMIT_SCALE` unset
- ⬜ Supabase Auth: leaked-password protection, rate limits reviewed, MFA considered for admins
- ⬜ Independent security review or penetration test
- ⬜ Dependency audit (`npm audit`) reviewed and a patching process in place

## Payments

- 🟡 Paystack adapter: create accounts, set keys and webhook, then test in **test mode** (success, decline, duplicate, tampered amount),
  then go live
- ⬜ Real prices approved for packages, plans and promotion placements (current values are placeholders)
- ⬜ Refund and dispute procedure for platform payments; receipts or invoices as required by tax rules
- ⬜ Accounting export or reconciliation process (Admin > Payments shows totals per currency)

## Legal and compliance

- ⬜ Lawyer-reviewed Terms, Privacy, Prohibited items, Complaints and Safety pages per active market (currently marked as drafts)
- ⬜ Data-protection registrations (NDPC, Ghana DPC; also ODPC and the Information Regulator before KE/ZA)
- ⬜ Processor agreements; international transfer safeguards
- ⬜ Breach-response plan
- ✅ Data export, deactivation and deletion flows

## Trust and safety operations

- ✅ Reports, moderation queue, suspensions, verification review, audit log
- ⬜ Moderator staffing, response-time targets and written moderation guidelines
- ⬜ Prohibited-terms list reviewed per market by someone with local knowledge
- ⬜ Seller-verification procedure against CAC (NG) and ORC (GH) registries

## Product quality

- ✅ Chromium end-to-end tests (40) on phone and desktop profiles, axe accessibility checks, offline and update behaviour
- ⬜ Manual testing on real low-end Android devices, iOS Safari (PWA install and offline) and Firefox
- ⬜ Performance on slow 3G (Lighthouse or WebPageTest), image CDN decision
- ⬜ Fix the intermittent listing-publish redirect (see STATUS_REPORT.md)
- ⬜ Remove demo content and verify that no "(Demo)" items exist in production

## Go-live gate

All ⬜ items in Infrastructure, Security, Payments (if charging) and Legal are done, and the restore drill has passed.
