#!/usr/bin/env node
// Bootstrap the first administrator. Run on a trusted machine only:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/grant-admin.mjs someone@example.com [admin|moderator]
// The account must already exist (register and verify the email first). The grant is written to the audit log.
import { createClient } from "@supabase/supabase-js";

const [email, role = "admin"] = process.argv.slice(2);
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !["admin", "moderator"].includes(role)) {
  console.error("Usage: node scripts/grant-admin.mjs <email> [admin|moderator]");
  process.exit(1);
}
if (!url || !key) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No account found for ${email}. Register first.`);
  process.exit(1);
}
if (!user.email_confirmed_at) {
  console.error(`${email} has not verified their email yet.`);
  process.exit(1);
}
const { error } = await db.from("user_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id,role" });
if (error) throw error;
await db.from("admin_audit_logs").insert({ actor_id: null, action: "role.bootstrap", target_type: "user", target_id: user.id, details: { role, via: "scripts/grant-admin.mjs" } });
console.log(`Granted ${role} to ${email}.`);
