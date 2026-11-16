#!/usr/bin/env node
// Lost-authenticator recovery. Lists or removes a user's two-step verification (TOTP) factors. Run on a trusted machine only.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/reset-mfa.mjs --project <ref> someone@example.com            # list factors (changes nothing)
//     node scripts/reset-mfa.mjs --project <ref> someone@example.com --remove   # remove ALL their factors
//
// --project must match the project in SUPABASE_URL ("local" for http://127.0.0.1), so a key for the wrong project is refused.
// Removing factors lets the account sign in with its password alone; sessions already open drop to password-only the next time
// they refresh (within an hour). The person must then set up an authenticator again before Admin will open. Each removal is
// written to the admin audit log. Nothing secret is printed: only factor ids, names, status and dates.
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const project = opt("--project");
const email = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--project");
const remove = flag("--remove");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !project) {
  console.error("Usage: node scripts/reset-mfa.mjs --project <project-ref|local> <email> [--remove]");
  process.exit(1);
}
if (!url || !key) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
const host = new URL(url).hostname;
const actual = host === "127.0.0.1" || host === "localhost" ? "local" : host.split(".")[0];
if (actual !== project) {
  console.error(`Refusing: --project ${project} does not match SUPABASE_URL (${actual}).`);
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No account found for ${email} in project ${project}.`);
  process.exit(1);
}

const { data: listed, error: listError } = await db.auth.admin.mfa.listFactors({ userId: user.id });
if (listError) throw listError;
const factors = listed.factors ?? [];
console.log(`${email} (${user.id}) in project ${project}: ${factors.length} factor(s)`);
for (const f of factors) console.log(`  - ${f.id}  ${f.factor_type}  ${f.status}  "${f.friendly_name ?? ""}"  added ${f.created_at}`);

if (!remove) {
  if (factors.length) console.log("\nNothing changed. Add --remove to delete all of these factors.");
  process.exit(0);
}
for (const f of factors) {
  const { error } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
  if (error) {
    console.error(`Failed to remove ${f.id}: ${error.message}`);
    process.exit(1);
  }
  await db.from("admin_audit_logs").insert({
    actor_id: null,
    action: "mfa.reset",
    target_type: "user",
    target_id: user.id,
    details: { factor_id: f.id, name: f.friendly_name ?? null, via: "scripts/reset-mfa.mjs" },
  });
  console.log(`Removed ${f.id}.`);
}
const { data: after } = await db.auth.admin.mfa.listFactors({ userId: user.id });
console.log(`Done. ${after?.factors?.length ?? 0} factor(s) left. Sign in with the password, then set up a new authenticator in Account > Two-step verification.`);
