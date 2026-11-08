# Production on Cloudflare Workers (OpenNext)

Production runs on a Cloudflare Worker built with [OpenNext](https://opennext.js.org/cloudflare). The public demo
stays on Vercel (`vercel.json`, its own Supabase project) and is not affected by anything here.

| | Production | Demo |
| --- | --- | --- |
| Host | Cloudflare Worker `naira-marketplace` (Workers Paid) | Vercel project `naira-demo` |
| Database | Production Supabase project (London) | Demo Supabase project (London) |
| Daily job | Supabase Cron (`pg_cron`) | Vercel cron (`vercel.json`) |
| Deploy | `npm run cf:deploy` (manual) | Vercel, on push to `main` |

**Code deploys never touch the database.** `npm run cf:deploy` only uploads a new Worker version. Database changes
are separate, deliberate steps (`supabase db push`), taken only with a backup first.

## Files

- `wrangler.jsonc`: Worker name, London placement (`aws:eu-west-2`), static assets, `preview_urls: false`.
- `open-next.config.ts`: no page cache, because every route is rendered per request.
- `public/_headers`: headers for static files (`sw.js` must not be cached; `next.config.ts` headers do not apply
  to static files on Workers).
- Versions are pinned: `next` 15.5.28, `@opennextjs/cloudflare` 1.20.15, `wrangler` 4.158.0. Newer adapters may
  require a newer Next.js; upgrade deliberately and re-run the e2e suite against `npm run cf:preview`.

## Configuration

Build-time values (baked into the browser bundle) go in an untracked `.env.production.local` on the machine that
builds. Only public values belong there:

```
NEXT_PUBLIC_SUPABASE_URL=https://<production-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production anon/publishable key>
NEXT_PUBLIC_SITE_URL=https://naira-marketplace.<subdomain>.workers.dev   # the custom domain after cutover
```

Server secrets are Worker secrets (encrypted, never in files or the repo):

```
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ANALYTICS_SALT            # 32+ random characters
npx wrangler secret put UPSTASH_REDIS_REST_URL    # optional, shared rate limits
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN  # optional
```

Plain settings are `vars` in `wrangler.jsonc` (`PAYMENTS_ENABLED_PROVIDERS` is empty until Paystack is configured).
Never set `ALLOW_MOCK_PAYMENTS`, `RATE_LIMIT_SCALE`, `NEXT_PUBLIC_SITE_MODE` or `CRON_SECRET` on production. Without
`CRON_SECRET` the `/api/cron/maintenance` route refuses every call; the daily job runs in the database instead.

## Deploy

```
npm ci
npm run cf:deploy          # builds with OpenNext and uploads a new version
npx wrangler deployments list
```

Check after each deploy: `/` loads, `/dashboard` redirects to sign-in when signed out, sign-in works, and the
`cf-placement` response header names a London location (e.g. `remote-LHR`).

## Daily maintenance (Supabase Cron)

Run once in the production SQL editor (enable Integrations > Cron first):

```sql
select cron.schedule('naira-daily-maintenance', '15 3 * * *', $$select public.purge_expired_data();$$);
-- check runs:
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- remove: select cron.unschedule('naira-daily-maintenance');
```

This is deliberately not a migration, so it is never applied to the demo database (which keeps its Vercel cron).

## Rolling back the Worker

```
npx wrangler deployments list        # find the previous version id
npx wrangler rollback <version-id>   # takes effect in seconds; secrets stay as they are
```

A rollback changes code only. If a release also needed a database change, roll back the code first, then decide on
the database separately (below).

## Recovering the database

The Free plan has no point-in-time recovery, so take a dump before every migration:

```
supabase db dump --db-url "$PROD_DB_URL" --role-only -f roles.sql
supabase db dump --db-url "$PROD_DB_URL" -f schema.sql
supabase db dump --db-url "$PROD_DB_URL" --data-only --use-copy -f data.sql
```

Plus a copy of Storage objects if photos exist. Keep dumps private: they contain password hashes and personal data.

- A migration fails part-way: each migration runs in a transaction, so a failed one leaves nothing behind. Fix the
  SQL and push again.
- A migration succeeds but damages data: write a corrective migration where possible (preferred, keeps history
  straight). Enum values added with `add value` cannot be removed; leave them unused.
- Worst case: restore the dumps into a fresh project (roles, then schema, then data) and point the Worker's
  `NEXT_PUBLIC_SUPABASE_*` values and service key at it, then redeploy.

## Custom domain (only after approval)

A Worker can serve `nairamarketplace.com` only if the domain's DNS is hosted on Cloudflare. Before switching the
nameservers at Namecheap:

1. Add the zone in Cloudflare and copy **every** Namecheap record, including the Resend records for
   `mail.nairamarketplace.com` (SPF/TXT, DKIM, MX, any return-path CNAME) and the demo subdomain. Set mail records
   to "DNS only" (grey cloud).
2. Compare the two lists line by line and keep a screenshot/export of the Namecheap records.
3. Switch nameservers, wait for the zone to be active, then add the custom domain to the Worker.
4. Rebuild with `NEXT_PUBLIC_SITE_URL=https://nairamarketplace.com`, deploy, and update Supabase Auth Site URL and
   redirect URLs.
5. Send a test sign-up email to confirm Resend still works.
