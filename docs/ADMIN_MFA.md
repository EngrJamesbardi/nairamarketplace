# Two-step verification for Admin (TOTP)

Admin and moderator accounts must pass two-step verification (an authenticator-app code, Supabase "aal2") before any
`/admin` page or admin action works. Buyers and sellers are never asked to set it up and never see a code step.

| Who | At sign-in | Opening /admin |
| --- | --- | --- |
| Buyer / seller | Password only | Sent to the home page (not staff) |
| Staff without an authenticator | Password only | Sent to Account > Two-step verification to set one up |
| Staff with an authenticator | Password, then a 6-digit code | Opens once the code is entered |

## Where it lives

- `src/lib/auth.ts`: `getMfaState()` reads the session's `aal` claim with `getClaims()` (signature checked) and the verified
  factors from `getUser()`. `requireAdmin()` (every admin page, the admin layout and `/admin/op`) requires `aal2`.
- `src/app/actions/auth.ts`: after a password sign-in, staff with an authenticator go to `/auth/mfa`. Password changes for
  accounts with an authenticator need the code first, because Supabase Auth requires `aal2` for them.
- `src/app/auth/mfa/`: the code step (rate limited per account and per address; "Cancel and sign out").
- `src/app/account/security/`: set up, list and remove authenticators. Set-up runs in the browser against Supabase Auth, so the
  QR code and setup key never reach this app's server. Removing one needs a verified session; removing the last one asks the
  user to type REMOVE.
- Security events (`mfa.verified`, `mfa.verify_failed`, `mfa.enrolled`, `mfa.removed`, `mfa.rate_limited`) are logged as one
  JSON line each with ids only. `mfa.enrolled`, `mfa.removed` and `mfa.reset` are also written to the admin audit log.
- Supabase setting: Authentication > Multi-Factor > App authenticator (TOTP) enabled. `supabase/config.toml` enables it locally.

Supabase Auth behaviour worth knowing (checked against the local stack):

- Verifying a new authenticator signs out that account's other password-only sessions.
- Adding a second authenticator, removing one, or changing the password all need a verified (`aal2`) session.
- There are **no recovery codes**. Plan for a lost phone (below).

## Avoiding lock-out

1. Set up **two** authenticators: for example your phone plus a password manager, or a second device.
   At sign-in you can pick either one.
2. Keep the Supabase dashboard login (with its own two-step verification) safe. It is the way back in if both are lost.

## Lost authenticator: recovery

Any of these removes the account's authenticators. The person can then sign in with their password and must set up a
new authenticator before Admin opens again. Sessions already open drop to password-only the next time they refresh (within
an hour). Removal does not change the password and does not touch any other data.

**A. Supabase dashboard** (checked in Supabase Studio 2026.10.19, which the hosted dashboard runs):

1. Open the production project, then **Authentication > Users**.
2. Search for the email and click the user to open its panel (**Overview** tab).
3. Under the account actions, click **Remove MFA factors** ("Removes all MFA factors associated with the user").
4. Confirm with **Remove factors**. The dialog notes that this drops the user to AAL1 and does not sign them out.
5. A "Successfully deleted the user's factors" message appears. The person signs in with their password and sets up a new
   authenticator under Account > Two-step verification. This route does not write to the app's audit log, so note it there
   or use B.

**B. Script** (writes `mfa.reset` to the admin audit log; prints only ids, names and dates):

```
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL=https://<project-ref>.supabase.co node scripts/reset-mfa.mjs --project <project-ref> someone@example.com          # list only
SUPABASE_URL=https://<project-ref>.supabase.co node scripts/reset-mfa.mjs --project <project-ref> someone@example.com --remove # remove all
unset SUPABASE_SERVICE_ROLE_KEY
```

`--project` must match the URL, so a key for the wrong project is refused.

**If the password is also lost:** reset the factors first (A or B), then use "Forgot password". With an authenticator still
present, the reset link leads to the code step before the new password can be saved.

## Tests

`tests/e2e/admin-mfa.spec.ts` covers set-up, wrong codes, sign-out and sign-in, the code step keeping the target page,
sessions open before an authenticator was added, a password-only post to `/admin/op`, moderators, buyers and sellers, a
backup authenticator, removal rules, lost-authenticator recovery with the script, and password reset with an authenticator.
The e2e global setup gives the seeded `admin@naira.test` a test authenticator (local Supabase only).
