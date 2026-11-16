import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "./helpers";
import { totp } from "./totp";

/**
 * Test-only TOTP secrets for local accounts, kept in the OS temp folder for the length of a run. They exist only in the local
 * Supabase stack. The app never shows a secret except in the user's own browser during set-up.
 */
const DIR = join(tmpdir(), "naira-e2e-totp");
const file = (email: string) => join(DIR, `${email.toLowerCase()}.txt`);
export const secretFor = (email: string): string | null => {
  try {
    return readFileSync(file(email), "utf8").trim();
  } catch {
    return null;
  }
};
export const rememberSecret = (email: string, secret: string) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file(email), secret);
};

async function env() {
  const text = readFileSync(".env.local", "utf8");
  const get = (k: string) => new RegExp(`^${k}=(.*)$`, "m").exec(text)?.[1]?.trim() ?? "";
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), anon: get("NEXT_PUBLIC_SUPABASE_ANON_KEY") };
}

export async function userId(email: string): Promise<string> {
  const db = await serviceClient();
  for (let page = 1; ; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) throw new Error(`no user ${email}`);
  }
}

/** Remove every factor of an account (what the dashboard's "Remove MFA factors" and scripts/reset-mfa.mjs do). */
export async function clearFactors(email: string) {
  const db = await serviceClient();
  const id = await userId(email);
  const { data } = await db.auth.admin.mfa.listFactors({ userId: id });
  for (const f of data?.factors ?? []) await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
}

/** Give an account exactly one verified authenticator through the Supabase Auth API, and remember its secret. */
export async function enrolViaApi(email: string, password = "Password123!", name = "Test authenticator") {
  await clearFactors(email);
  const { url, anon } = await env();
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error: signInError } = await c.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const { data, error } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: name });
  if (error || !data) throw error ?? new Error("enrol failed");
  const v = await c.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) });
  if (v.error) throw v.error;
  rememberSecret(email, data.totp.secret);
  return data.totp.secret;
}

/** Create a confirmed account with a staff role (admin or moderator), without an authenticator. */
export async function createStaff(email: string, role: "admin" | "moderator", password = "Password123!") {
  const db = await serviceClient();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Staff ${role}`, country_code: "NG" } });
  if (error) throw error;
  const { error: roleError } = await db.from("user_roles").insert({ user_id: data.user.id, role });
  if (roleError) throw roleError;
  return data.user.id;
}

/** Fill the code step with a fresh code. Waits for the next 30-second window if the current one is about to roll over. */
export async function enterCode(page: Page, secret: string, label = "6-digit code") {
  if (Date.now() % 30000 > 27000) await page.waitForTimeout(30000 - (Date.now() % 30000) + 500);
  await page.getByLabel(label).fill(totp(secret));
}

export async function passCodeStep(page: Page, email: string) {
  await expect(page).toHaveURL(/\/auth\/mfa/);
  const secret = secretFor(email);
  if (!secret) throw new Error(`No test authenticator for ${email}`);
  await enterCode(page, secret);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
}
