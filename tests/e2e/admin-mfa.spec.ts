import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Request } from "@playwright/test";
import { hydrated, latestEmailLink, serviceClient, signIn, uid } from "./helpers";
import { createStaff, enrolViaApi, enterCode, rememberSecret, secretFor, userId } from "./mfa";

// Two-step verification (TOTP) for admin and moderator accounts. Runs against the local Supabase stack only.

async function passwordOnly(page: Page, email: string, password = "Password123!") {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The browser's "authenticator added" server-action request, kept so a test can send it again. */
let lastRecordCall: Request | null = null;

async function enrolInBrowser(page: Page, email: string, name?: string) {
  await hydrated(page);
  if (name) await page.getByLabel("Name for this authenticator").fill(name);
  await page.getByRole("button", { name: "Start set-up" }).click();
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  await page.getByRole("button", { name: "Can't scan? Show setup key" }).click();
  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  // A wrong code is refused and nothing is turned on.
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify and turn on" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "didn't work" })).toBeVisible();
  await enterCode(page, secret);
  const recordCall = page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
  await page.getByRole("button", { name: "Verify and turn on" }).click();
  lastRecordCall = await recordCall;
  await page.waitForURL(/\/account\/security\?added=1/);
  rememberSecret(email, secret);
  return secret;
}

async function signOut(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL(/signedout=1/);
}

test.describe("admin two-step verification", () => {
  test("a new admin must set up an authenticator before Admin opens, then enters a code at every sign-in", async ({ page }) => {
    const email = `mfa-admin-${uid()}@example.test`;
    await createStaff(email, "admin");
    await passwordOnly(page, email);
    // No authenticator yet: no code step at sign-in, but Admin sends them to set one up.
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\/security\?required=admin/);
    await expect(page.getByRole("alert").filter({ hasText: "Admin needs two-step verification" })).toBeVisible();

    await enrolInBrowser(page, email);
    await expect(page.getByRole("status").filter({ hasText: "Authenticator added" })).toBeVisible();
    await expect(page.getByTestId("factor-item")).toHaveCount(1);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Administrator")).toBeVisible();
    // The account page shows the setting.
    await page.goto("/account");
    await expect(page.getByRole("link", { name: /Two-step verification: on \(required for Admin\)/ })).toBeVisible();

    // The event is in the audit log, with ids only (no secret).
    const db = await serviceClient();
    const id = await userId(email);
    const { data: audit } = await db.from("admin_audit_logs").select("action, details").eq("target_id", id).eq("action", "mfa.enrolled");
    expect(audit?.length).toBe(1);
    expect(JSON.stringify(audit)).not.toContain(secretFor(email)!);
    // Sending the same "authenticator added" request again does not add a second entry.
    const call = lastRecordCall!;
    const replay = await page.request.post(call.url(), { headers: call.headers(), data: call.postDataBuffer() ?? undefined });
    expect(replay.ok()).toBe(true);
    const { data: again } = await db.from("admin_audit_logs").select("id").eq("target_id", id).eq("action", "mfa.enrolled");
    expect(again?.length).toBe(1);

    // Sign out and back in: password, then a code. A wrong code is refused.
    await signOut(page);
    await passwordOnly(page, email);
    await page.waitForURL(/\/auth\/mfa/);
    await hydrated(page);
    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("That code didn't work")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/mfa/);
    // Until the code is entered, Admin stays closed.
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/auth\/mfa\?next=%2Fadmin/);
    await enterCode(page, secretFor(email)!);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/admin$/);
  });

  test("sign-in keeps the page the admin was going to; Cancel signs out only this browser", async ({ page, browser }) => {
    const email = `mfa-next-${uid()}@example.test`;
    await createStaff(email, "admin");
    await enrolViaApi(email);
    await page.goto("/admin/reports");
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fadmin%2Freports/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/auth\/mfa\?next=%2Fadmin%2Freports/);
    await enterCode(page, secretFor(email)!);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/admin\/reports$/);

    // A second browser signs in with the password, then cancels at the code step.
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await passwordOnly(other, email);
    await other.waitForURL(/\/auth\/mfa/);
    await hydrated(other);
    await other.getByRole("button", { name: "Cancel and sign out" }).click();
    await other.waitForURL(/\/auth\/login$/);
    await other.goto("/account");
    await expect(other).toHaveURL(/\/auth\/login/);
    await ctx.close();

    // The first browser's verified session is untouched: Admin still opens, and its refresh token still works.
    await page.goto("/admin/reports");
    await expect(page).toHaveURL(/\/admin\/reports$/);
    // An access token outlives a sign-out for up to an hour, so check the refresh token too: a global sign-out would revoke it.
    const cookies = (await page.context().cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
    const raw = cookies.map((c) => c.value).join("");
    const stored = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8")) as { refresh_token: string };
    const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    const refresh = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    expect(refresh.status).toBe(200);
  });

  test("adding an authenticator signs out other password-only sessions; they come back through the code step", async ({ page }) => {
    const email = `mfa-open-${uid()}@example.test`;
    await createStaff(email, "admin");
    await passwordOnly(page, email);
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
    // Authenticator added from another device while this password-only session is open: Supabase Auth ends this session.
    await enrolViaApi(email);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fadmin/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/auth\/mfa\?next=%2Fadmin/);
    await enterCode(page, secretFor(email)!);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/admin$/);
    await expect(page.getByText("Administrator")).toBeVisible();
  });

  test("a direct post to /admin/op from a password-only session is refused", async ({ page }) => {
    const email = `mfa-op-${uid()}@example.test`;
    await createStaff(email, "admin");
    await enrolViaApi(email);
    await passwordOnly(page, email);
    await page.waitForURL(/\/auth\/mfa/);
    const target = await userId("buyer@naira.test");
    const res = await page.request.post("/admin/op", {
      form: { op: "seller.feature", id: target, featured: "1" },
      headers: { Origin: new URL(page.url()).origin },
      maxRedirects: 0,
    });
    expect([303, 307]).toContain(res.status());
    expect(res.headers()["location"]).toMatch(/\/auth\/mfa/);
    const db = await serviceClient();
    const { data } = await db.from("admin_audit_logs").select("id").eq("actor_id", await userId(email));
    expect(data?.filter(Boolean).length ?? 0).toBe(0);
  });

  test("moderators need a code too; buyers and sellers are never asked", async ({ page, browser }) => {
    const email = `mfa-mod-${uid()}@example.test`;
    await createStaff(email, "moderator");
    await enrolViaApi(email);
    await passwordOnly(page, email);
    await page.waitForURL(/\/auth\/mfa/);
    await enterCode(page, secretFor(email)!);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
    await page.goto("/admin");
    await expect(page.getByText("Moderator")).toBeVisible();

    for (const member of ["buyer@naira.test", "chioma@naira.test"]) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await passwordOnly(p, member);
      await p.waitForURL((u) => !u.pathname.startsWith("/auth"));
      await p.goto("/account");
      await expect(p.getByRole("heading", { name: "Your account" })).toBeVisible();
      await expect(p.getByRole("link", { name: /Two-step verification/ })).toHaveCount(0);
      await p.goto("/account/security");
      await expect(p).toHaveURL(/\/account$/);
      await p.goto("/admin");
      await expect(p).not.toHaveURL(/\/admin|\/auth\/mfa|\/account\/security/);
      await ctx.close();
    }
  });

  test("a backup authenticator works, and removing one needs a verified session", async ({ page }) => {
    const email = `mfa-backup-${uid()}@example.test`;
    await createStaff(email, "admin");
    await enrolViaApi(email, "Password123!", "Phone");
    const first = secretFor(email)!;
    await signIn(page, email);
    await page.goto("/account/security");
    await expect(page.getByRole("heading", { name: "Add a backup authenticator" })).toBeVisible();
    const backup = await enrolInBrowser(page, `${email}#backup`, "Laptop");
    rememberSecret(email, first);
    await expect(page.getByTestId("factor-item")).toHaveCount(2);

    // Sign in with the backup authenticator.
    await signOut(page);
    await passwordOnly(page, email);
    await page.waitForURL(/\/auth\/mfa/);
    await page.getByLabel("Authenticator").selectOption({ label: "Laptop" });
    await enterCode(page, backup);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"));

    // Remove "Phone" (not the last one: no typed confirmation needed).
    await page.goto("/account/security");
    await hydrated(page);
    await page.getByRole("button", { name: "Remove Phone" }).click();
    await page.getByRole("button", { name: "Remove authenticator" }).click();
    await page.waitForURL(/removed=1/);
    await expect(page.getByTestId("factor-item")).toHaveCount(1);
    // The last one asks for REMOVE.
    await hydrated(page);
    await page.getByRole("button", { name: "Remove Laptop" }).click();
    await page.getByRole("button", { name: "Remove authenticator" }).click();
    await expect(page.getByText("Type REMOVE to confirm. You will need")).toBeVisible();
    await page.getByLabel("Type REMOVE to confirm").fill("REMOVE");
    await page.getByRole("button", { name: "Remove authenticator" }).click();
    await page.waitForURL(/removed=1/);
    await expect(page.getByTestId("factor-item")).toHaveCount(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\/security\?required=admin/);
    const { data: audit } = await (await serviceClient()).from("admin_audit_logs").select("action").eq("target_id", await userId(email)).eq("action", "mfa.removed");
    expect(audit?.length).toBe(2);
  });

  test("a password-only session cannot remove an authenticator", async ({ page }) => {
    const email = `mfa-noremove-${uid()}@example.test`;
    await createStaff(email, "admin");
    await enrolViaApi(email);
    await passwordOnly(page, email);
    await page.waitForURL(/\/auth\/mfa/);
    await page.goto("/account/security");
    await expect(page.getByTestId("factor-item")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "confirm a code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start set-up" })).toHaveCount(0);
  });

  test("lost authenticator: the recovery script removes it, the admin signs in with the password and sets up a new one", async ({ page }) => {
    const email = `mfa-lost-${uid()}@example.test`;
    await createStaff(email, "admin");
    await enrolViaApi(email);
    const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    const run = (...args: string[]) =>
      execFileSync("node", ["scripts/reset-mfa.mjs", ...args], { env: { ...process.env, SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }, encoding: "utf8" });
    const runTyped = (typed: string, ...a: string[]) =>
      execFileSync("node", ["scripts/reset-mfa.mjs", ...a], { input: `${typed}\n`, env: { ...process.env, SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }, encoding: "utf8" });
    // Wrong project, a public key or the wrong confirmation are refused and change nothing; listing changes nothing.
    expect(() => run("--project", "gzvidfpfwwosublbogzx", email, "--remove")).toThrow();
    expect(() =>
      execFileSync("node", ["scripts/reset-mfa.mjs", "--project", "local", email, "--remove"], {
        env: { ...process.env, SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow();
    expect(() => runTyped("someone-else@example.test", "--project", "local", email, "--remove")).toThrow();
    expect(run("--project", "local", email)).toContain("1 factor(s)");
    expect(run("--project", "local", email)).toContain("Nothing changed");
    const out = runTyped(email, "--project", "local", email, "--remove");
    expect(out).toContain("0 factor(s) left");
    expect(out).not.toContain(secretFor(email)!);

    await passwordOnly(page, email);
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\/security\?required=admin/);
    await enrolInBrowser(page, email, "New phone");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    const { data: audit } = await (await serviceClient()).from("admin_audit_logs").select("action").eq("target_id", await userId(email)).in("action", ["mfa.reset_started", "mfa.reset"]).order("id");
    expect((audit ?? []).map((a) => a.action)).toEqual(["mfa.reset_started", "mfa.reset"]);
  });

  test("password reset with an authenticator asks for the code first", async ({ page, browser }) => {
    const email = `mfa-reset-${uid()}@example.test`;
    await createStaff(email, "admin");
    await enrolViaApi(email);
    await page.goto("/auth/forgot");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("reset link");
    let link = "";
    await expect.poll(async () => (link = await latestEmailLink(email)).includes("type=recovery")).toBe(true);
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto(link);
    await expect(other).toHaveURL(/\/auth\/mfa\?next=(%2F|\/)auth(%2F|\/)reset/);
    await enterCode(other, secretFor(email)!);
    await other.getByRole("button", { name: "Verify" }).click();
    await other.waitForURL(/\/auth\/reset/);
    await other.getByLabel("New password").fill("Newpass12345");
    await other.getByLabel("Confirm password").fill("Newpass12345");
    await other.getByRole("button", { name: "Update password" }).click();
    await other.waitForURL(/password=updated/);
    await ctx.close();
    await passwordOnly(page, email, "Newpass12345");
    await page.waitForURL(/\/auth\/mfa/);
  });

  test.afterAll(async () => {
    // Keep the seeded admin's test authenticator for the other admin specs.
    if (!secretFor("admin@naira.test")) await enrolViaApi("admin@naira.test");
  });
});
