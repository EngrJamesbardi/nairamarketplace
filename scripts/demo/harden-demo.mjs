#!/usr/bin/env node
// Run on the DEMO cloud project straight after seeding, before the demo site goes live.
//   - gives every seed account (@naira.test with a seed profile) a long random password that is never printed or stored
//   - removes every role (including admin) from seed accounts
//   - proves the public seed password no longer signs in
// It refuses unless --project-ref matches the URL and the project holds seeded demo data, so it cannot touch production.
//
//   SUPABASE_URL=https://<demo-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<demo secret key> \
//     node scripts/demo/harden-demo.mjs --project-ref <demo-ref>
//
// Then make your own account the demo admin (applies to this project only):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/grant-admin.mjs you@example.com admin
import { createClient } from "@supabase/supabase-js";
import { checkDemoTarget, classifySignInProbe, isSeedAccount, parseArgs, PUBLIC_SEED_PASSWORD, randomPassword } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/demo/harden-demo.mjs --project-ref <demo-ref>");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

const seedProfiles = must(await db.from("profiles").select("id").eq("is_seed", true), "read seed profiles");
const target = checkDemoTarget({ url, confirmRef: args["project-ref"], seedProfileCount: seedProfiles.length });
if (!target.ok) {
  console.error(`Refusing: ${target.reason}`);
  process.exit(1);
}
const seedIds = new Set(seedProfiles.map((p) => p.id));

const seedUsers = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  seedUsers.push(...data.users.filter((u) => isSeedAccount(u, seedIds)));
  if (data.users.length < 200) break;
}

for (const u of seedUsers) {
  const { error } = await db.auth.admin.updateUserById(u.id, { password: randomPassword() });
  if (error) throw new Error(`reset password for ${u.email}: ${error.message}`);
}
const removed = must(await db.from("user_roles").delete().in("user_id", seedUsers.map((u) => u.id)).select("user_id, role"), "remove seed roles");
if (removed.length) {
  await db.from("admin_audit_logs").insert({ actor_id: null, action: "role.demo_harden", target_type: "user", target_id: null, details: { removed: removed.length, via: "scripts/demo/harden-demo.mjs" } });
}

// Proof: the public password must be REJECTED for every seed account. A rate limit or network error is not proof,
// so those attempts are retried with back-off and, if still unclear, reported as unverified (non-zero exit).
const RETRY_DELAYS_MS = [0, 5_000, 20_000, 60_000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let stillWorks = 0;
let unverified = 0;
for (const u of seedUsers) {
  let outcome = "unknown";
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);
    const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    outcome = classifySignInProbe(await probe.auth.signInWithPassword({ email: u.email, password: PUBLIC_SEED_PASSWORD }));
    if (outcome !== "unknown") break;
  }
  if (outcome === "accepted") stillWorks++;
  if (outcome === "unknown") unverified++;
}
const remainingRoles = must(await db.from("user_roles").select("user_id").in("user_id", seedUsers.map((u) => u.id)), "check roles");

console.log(`Demo project ${target.ref}: ${seedUsers.length} seed account(s) given new random passwords; ${removed.length} role(s) removed.`);
console.log(`Public seed password still works for: ${stillWorks} account(s). Could not verify (rate limit or error): ${unverified}. Seed accounts with roles: ${remainingRoles.length}.`);
if (stillWorks || remainingRoles.length) process.exit(2);
if (unverified) {
  console.log("Wait a few minutes and run this script again to finish the check. It is safe to repeat.");
  process.exit(3);
}
