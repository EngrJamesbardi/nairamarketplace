# External services

"Status" describes this codebase as delivered. Nothing below has been purchased, and no credentials have been supplied.

| Service | Needed for | Required? | Status | What it needs |
| --- | --- | --- | --- | --- |
| **Supabase** (Postgres, Auth, Storage, Realtime) | Everything | Yes | Built and tested against the **local** Supabase stack (CLI 2.122). No hosted project yet | A Supabase project (free tier is fine for testing; Pro for backups and production) |
| **Hosting** for Next.js (Vercel, Render, Fly.io, VPS) | Serving the app | Yes | Production build runs locally (`next start`); not deployed | Account + domain + TLS |
| **Domain + DNS** | Public URL, email links, PWA install | Yes | Not set up | Domain registrar |
| **Transactional email (SMTP)** such as Resend, Postmark, Amazon SES or Mailgun | Verification and password-reset emails at volume | Yes for launch | Local emails go to Mailpit. Supabase's built-in sender is rate-limited and for testing only | SMTP credentials set in Supabase Auth settings; SPF/DKIM on the domain |
| **Paystack** (NG, GH, KE, ZA) | Buying credits and seller plans | Only to take money | Adapter written; **untested and not configured** (`src/lib/payments/paystack.ts`) | Paystack business account per market, `PAYSTACK_SECRET_KEY`, webhook URL |
| Flutterwave or another provider | Alternative or extra coverage | Optional | Not implemented. Add another `PaymentProvider` | Account + keys |
| **Scheduler** (Vercel Cron, GitHub Actions, pg_cron) | Daily expiry and retention job | Yes | Endpoint implemented and tested locally | `CRON_SECRET`, a scheduler |
| **Shared rate-limit store** (Upstash Redis or similar) | App-level rate limits across several instances | When running more than one instance | Not integrated (in-memory today) | Redis URL/token + small code change |
| **Error monitoring** (such as Sentry) | Seeing production errors | Strongly recommended | Not integrated | DSN |
| **Off-site backup storage** (S3-compatible bucket in another account) | Independent backups | Strongly recommended | Procedure documented | Bucket + credentials |
| SMS / phone verification (Termii, Africa's Talking, Twilio) | Verifying phone numbers | Optional | **Not implemented**. Phone numbers are stored but marked unverified | Provider account + sender ID registration |
| Maps / geocoding | Exact distances, map views | Optional | Not used. Distance search uses region centroids stored in the database | Provider key |
| Image CDN / moderation API | Faster images, automatic nudity/violence screening | Optional | Not used. Images are type-checked and size-limited; moderation is human, via reports | Provider account |

## Secrets handling

- Only `NEXT_PUBLIC_*` values reach the browser: the site URL, Supabase URL and anon key.
- `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `MOCK_PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET` and `ANALYTICS_SALT` are read only in
  `server-only` modules and route handlers.
- `.env.local` is git-ignored; `.env.example` contains placeholders only.
