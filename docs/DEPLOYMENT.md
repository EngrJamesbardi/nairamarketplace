# Deployment, operations and backups

Nothing in this repository has been deployed. These steps describe how to do it; each one that costs money or touches production needs
the owner's approval first.

## 1. Supabase project

1. Create a Supabase project in the region closest to your users (for Nigeria and Ghana, `eu-west` or `eu-central` usually has the lowest
   latency; Supabase has no African region at the time of writing). Paid tiers are needed for daily backups and point-in-time recovery.
2. Link and push the schema (never run `db reset` against production):
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies supabase/migrations in order
   ```
   Do **not** load `supabase/seed.sql` in production. It creates demo accounts with a known password.
3. Auth settings (Dashboard > Authentication):
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/**`
   - Email confirmations: on
   - Minimum password length: 8
   - Leaked-password protection: on
   - Custom SMTP: required for real email volume (see EXTERNAL_SERVICES.md)
   - Rate limits: review the per-hour email limit.
4. Storage: the migrations create the `listing-images` and `avatars` buckets and their policies. Check that both buckets exist.
5. Realtime: the migrations add `messages`, `notifications` and `offers` to the `supabase_realtime` publication.

## 2. Create the first administrator

Register normally on the live site and verify the email. Then, from a trusted machine:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/grant-admin.mjs you@example.com admin
```

Further admins and moderators can then be managed in the admin dashboard. All role changes are written to the audit log.

## 3. Host the Next.js app

Any Node 20+ host works (Vercel, Render, Fly.io, a VPS with `npm run build && npm start` behind a TLS proxy). Set:

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>`. Used for auth and payment return URLs |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret, server only.** Never prefix it with `NEXT_PUBLIC_` |
| `PAYMENTS_ENABLED_PROVIDERS` | e.g. `paystack`. **Never include `mock` in production** |
| `PAYSTACK_SECRET_KEY` | Secret. Needed for Paystack (see EXTERNAL_SERVICES.md) |
| `MOCK_PAYMENT_WEBHOOK_SECRET` | Development only |
| `ALLOW_MOCK_PAYMENTS` | **Leave unset.** Production builds refuse the mock provider unless this is `true` (private local tests only) |
| `CRON_SECRET` | 32+ random characters |
| `ANALYTICS_SALT` | Random; used to hash viewer keys for sponsored-event de-duplication |
| `RATE_LIMIT_SCALE` | **Leave unset** in production (test-only multiplier) |

HTTPS is required: service workers, secure cookies and HSTS depend on it.

**Multiple instances:** the app-level rate limiter (sign-in, sign-up, password reset, export, promotion events) is in-memory per
instance. Before running more than one instance, back `src/lib/rate-limit.ts` with a shared store such as Redis or Upstash. Database-level
limits are already shared.

## 4. Payments (when approved)

1. Create a Paystack account per market and complete business verification.
2. Set `PAYSTACK_SECRET_KEY` and add `paystack` to `PAYMENTS_ENABLED_PROVIDERS`.
3. In the Paystack dashboard, set the webhook URL to `https://<your-domain>/api/payments/webhook/paystack`.
4. In Admin > Countries, set the market's payment provider to `paystack`.
5. Review the placeholder prices in Admin > Credits & packages and Admin > Subscription plans.
6. Test end-to-end in Paystack **test mode**:
   - a successful payment
   - a declined payment
   - a duplicate webhook
   - a tampered amount
   Then confirm Admin > Payments shows **0 ledger mismatches**.
7. Only then switch to live keys.

## 5. Scheduled maintenance (daily)

`GET /api/cron/maintenance` with header `Authorization: Bearer $CRON_SECRET` runs `purge_expired_data()`. It:

- expires listings, offers, promotions and plans
- deletes read notifications older than 180 days
- deletes view events older than 90 days
- deletes promotion events older than 400 days

Schedule it with Vercel Cron, GitHub Actions, any external cron service, or Supabase `pg_cron` (call `select purge_expired_data();`
directly).

## 6. Backups and restore

| What | How | Frequency |
| --- | --- | --- |
| Database | Supabase daily backups (Pro) or point-in-time recovery (add-on) | Daily / continuous |
| Database, independent copy | `pg_dump` to encrypted off-site storage (below) | Daily, keep 30 days |
| Storage (images) | Sync the buckets with the S3-compatible API (`rclone` or `aws s3 sync`) | Daily |
| Config | Environment variables in a password manager or secrets store; migrations in git | On change |

Independent logical backup:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage -f naira-$(date +%F).dump
# encrypt (e.g. age or gpg) and upload to storage in another account and region
```

Restore drill (do this before launch and quarterly):

1. Create a scratch Supabase project or a local `npx supabase start`.
2. `pg_restore --no-owner --clean --if-exists -d "$SCRATCH_DATABASE_URL" naira-YYYY-MM-DD.dump`
3. Run the checks:
   - `select count(*) from credit_ledger_mismatches();` must return `0`
   - sign in with a test account
   - open a conversation
4. Record how long the restore took (RTO) and the age of the backup (RPO).

Ledger and audit tables are append-only. Never "fix" money by editing rows. Use Admin > Users > Adjust credits, which writes a new,
audited ledger entry.

## 7. Monitoring (recommended, not yet integrated)

- Error tracking (for example Sentry) for the server and the browser.
- Uptime checks on `/` and `/api/cron/maintenance` results.
- Alerts on:
  - payment webhook 4xx/5xx responses
  - `ledger_mismatches > 0`
  - backlog in the moderation queue
