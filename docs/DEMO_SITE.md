# Demo site (demo.nairamarketplace.com)

The demo is a **separate** Supabase project and a **separate** Vercel project. It shares no database, keys or accounts with production.
Production is never seeded and never receives demo data.

| | Production | Demo |
| --- | --- | --- |
| Supabase | production project, schema only (`supabase db push`) | demo project, schema + seed (`supabase db push --include-seed`) |
| Vercel | `nairamarketplace` → `nairamarketplace.com` | `naira-demo` → `demo.nairamarketplace.com` |
| `NEXT_PUBLIC_SITE_MODE` | unset | `demo` (banner on every page, `robots.txt` disallows all, `X-Robots-Tag: noindex`) |
| Payments | off | off |

## Setting up the demo database

Every step runs from a trusted machine with the **demo** project's URL and secret key typed into the terminal. Never commit keys.

1. Link and push with seed: `npx supabase link --project-ref <demo-ref>` then `npx supabase db push --include-seed`.
   This recreates the 10 seed listings (photos are the drawings in `public/seed/`).
2. **Immediately** remove the public seed password and the seed admin:
   ```bash
   SUPABASE_URL=https://<demo-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<demo secret> \
     node scripts/demo/harden-demo.mjs --project-ref <demo-ref>
   ```
   Every `@naira.test` seed account gets a random password nobody knows, every seed role (including admin) is removed, and the script
   proves `Password123!` no longer signs in. It exits 2 if the password still works or a seed role remains, and 3 if Supabase
   rate-limited the check (wait a few minutes and run it again; repeating is safe).
   **If the demo database is ever re-seeded or reset, run this script again straight away**: seeding restores the public password.
3. Copy extra hand-made listings from a local database (read-only on the local side):
   ```bash
   LOCAL_SUPABASE_SERVICE_ROLE_KEY=<local key from `npx supabase status`> \
     node scripts/demo/export-local.mjs --listing <id-or-prefix> --out ./demo-export
   SUPABASE_URL=https://<demo-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<demo secret> \
     node scripts/demo/import-demo.mjs --project-ref <demo-ref> --in ./demo-export
   ```
   The export only selects rows and downloads photos. Owner emails, passwords and contact details are not exported. The import creates a
   new demo-only owner with a random password, the storefront, the listing (marked as demo data) and its photos, and skips listings it
   already imported. `demo-export/` holds photos: don't commit it.
4. Register your own account on the demo site, verify it, then make it the **demo** admin (this only affects the demo project):
   ```bash
   SUPABASE_URL=https://<demo-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<demo secret> node scripts/grant-admin.mjs you@example.com admin
   ```

## Safety rails in the scripts

- `harden-demo.mjs` and `import-demo.mjs` refuse to run unless `--project-ref` matches the URL **and** the project already contains seeded
  demo profiles. Production has none, so they cannot touch it.
- `export-local.mjs` refuses any non-local address.
- No script prints passwords or keys.
