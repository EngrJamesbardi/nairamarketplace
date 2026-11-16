#!/usr/bin/env node
// Lost-authenticator recovery: lists or removes a user's two-step verification (TOTP) factors. Run on a trusted machine only.
//
//   read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL=https://<ref>.supabase.co node scripts/reset-mfa.mjs --project <ref> someone@example.com            # list only
//   SUPABASE_URL=https://<ref>.supabase.co node scripts/reset-mfa.mjs --project <ref> someone@example.com --remove   # remove all
//
// Safety:
// - --project must match SUPABASE_URL ("local" for http://127.0.0.1). A legacy service-role key (a JWT) must also name that
//   project and the service_role role; a new-style secret key (sb_secret_...) is checked by Supabase itself, which rejects a
//   key from another project before anything is read.
// - --remove asks you to type the account's email to confirm.
// - The audit entry (mfa.reset_started) is written BEFORE anything is removed; if it cannot be written, nothing is removed.
//   A second entry (mfa.reset) records the result. Success is only reported when the factors are gone AND both entries exist.
// - Nothing secret is printed: only factor ids, names, status and dates. Exit code 0 = done, 1 = refused or failed, 2 = factors
//   removed but the completion audit entry could not be written (the start entry exists).
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const fail = (msg, code = 1) => {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
};

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const project = opt("--project");
const email = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--project");
const remove = args.includes("--remove");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !project) fail("Usage: node scripts/reset-mfa.mjs --project <project-ref|local> <email> [--remove]");
if (!url || !key) fail("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.");

// 1. The URL must be the named project.
let host;
try {
  host = new URL(url).hostname;
} catch {
  fail("SUPABASE_URL is not a valid URL.");
}
const isLocal = host === "127.0.0.1" || host === "localhost";
const urlProject = isLocal ? "local" : host.endsWith(".supabase.co") ? host.split(".")[0] : null;
if (!urlProject) fail(`SUPABASE_URL (${host}) is not a *.supabase.co project URL or a local stack.`);
if (urlProject !== project) fail(`--project ${project} does not match SUPABASE_URL (${urlProject}). Nothing was changed.`);

// 2. The key must be a service-role key for that project.
if (key.startsWith("sb_publishable_")) fail("That is a publishable (public) key, not the service-role secret key.");
if (!key.startsWith("sb_secret_")) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
  } catch {
    fail("SUPABASE_SERVICE_ROLE_KEY is neither an sb_secret_ key nor a valid JWT.");
  }
  if (claims.role !== "service_role") fail(`That key has role "${claims.role}", not service_role.`);
  const keyProject = claims.ref ?? (claims.iss === "supabase-demo" ? "local" : null);
  if (keyProject !== project) fail(`The service-role key belongs to project "${keyProject ?? "unknown"}", not "${project}". Nothing was changed.`);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// 3. Find the account (this call also fails if Supabase does not accept the key for this project).
let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) fail(`Supabase refused the request (${error.status ?? ""} ${error.message}). Check the key belongs to project ${project}.`);
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) fail(`No account found for ${email} in project ${project}.`);

const listFactors = async () => {
  const { data, error } = await db.auth.admin.mfa.listFactors({ userId: user.id });
  if (error) fail(`Could not list factors: ${error.message}`);
  return data.factors ?? [];
};
const factors = await listFactors();
console.log(`${email} (${user.id}) in project ${project}: ${factors.length} factor(s)`);
for (const f of factors) console.log(`  - ${f.id}  ${f.factor_type}  ${f.status}  "${f.friendly_name ?? ""}"  added ${f.created_at}`);

if (!remove) {
  console.log(factors.length ? "\nNothing changed. Add --remove to delete all of these factors." : "\nNothing to do.");
  process.exit(0);
}
if (!factors.length) {
  console.log("\nNothing to remove. Nothing changed.");
  process.exit(0);
}

// 4. Typed confirmation.
const rl = createInterface({ input: process.stdin, output: process.stdout });
const closed = new Promise((resolve) => rl.once("close", () => resolve(null)));
const answer = await Promise.race([rl.question(`\nThis removes ALL ${factors.length} factor(s) for this account in project ${project}.\nType the account email to confirm: `), closed]);
rl.close();
if (answer === null) fail("No confirmation was typed. Nothing was changed.");
const typed = answer.trim();
if (typed.toLowerCase() !== email.toLowerCase()) fail("The email did not match. Nothing was changed.");

// 5. Audit first: if this cannot be written, stop before changing anything.
const summary = factors.map((f) => ({ id: f.id, type: f.factor_type, status: f.status, name: f.friendly_name ?? null }));
const started = await db.from("admin_audit_logs").insert({
  actor_id: null,
  action: "mfa.reset_started",
  target_type: "user",
  target_id: user.id,
  details: { factors: summary, via: "scripts/reset-mfa.mjs" },
});
if (started.error) fail(`Could not write the audit entry (${started.error.message}). Nothing was removed.`);

// 6. Remove, then check what is left.
const removed = [];
for (const f of factors) {
  const { error } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
  if (error) {
    console.error(`Failed to remove ${f.id}: ${error.message}`);
    break;
  }
  removed.push(f.id);
  console.log(`Removed ${f.id}.`);
}
const left = await listFactors();

// 7. Completion audit entry, then the result.
const done = await db.from("admin_audit_logs").insert({
  actor_id: null,
  action: left.length ? "mfa.reset_incomplete" : "mfa.reset",
  target_type: "user",
  target_id: user.id,
  details: { removed, remaining: left.map((f) => f.id), via: "scripts/reset-mfa.mjs" },
});
if (left.length) fail(`${left.length} factor(s) are still present (${left.map((f) => f.id).join(", ")}). Recovery is NOT complete.`);
if (done.error)
  fail(`All factors were removed, but the completion audit entry could not be written (${done.error.message}). The mfa.reset_started entry exists. Record this manually.`, 2);
console.log(`\nDone. 0 factor(s) left; audit entries mfa.reset_started and mfa.reset written.`);
console.log("Next: sign in with the password, then set up a new authenticator in Account > Two-step verification.");
