import { test, expect } from "@playwright/test";
import { latestEmailLink, signIn, uid, hydrated } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function emailCount(to: string) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  return ((await res.json()) as { messages_count: number }).messages_count;
}

test.describe("email auth flows", () => {
  test("verification link works in a different browser, then sign out and back in keeps the session", async ({ page, browser }) => {
    const id = uid();
    const email = `verify-${id}@naira.test`;
    await page.goto("/auth/register");
    await page.getByLabel("Your name").fill(`Verify ${id}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Testpass123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    // Signing in before verifying explains what to do.
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Testpass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\w/ }).first()).toContainText("verify your email");

    // The emailed link carries a token hash, so it works outside the browser that signed up (e.g. a phone's mail app).
    const link = await latestEmailLink(email);
    expect(link).toContain("token_hash=");
    const other = await browser.newContext();
    const phone = await other.newPage();
    await phone.goto(link);
    await expect(phone.getByRole("heading", { name: new RegExp(`Welcome, Verify ${id}`) })).toBeVisible();
    await other.close();

    // A used link is rejected with a useful message.
    await page.goto(link);
    await expect(page).toHaveURL(/\/auth\/login\?error=link/);
    await expect(page.getByRole("alert").filter({ hasText: /\w/ }).first()).toContainText("already used");

    await signIn(page, email, "Testpass123");
    await page.reload();
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account/);
    await hydrated(page);
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/signedout=1/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("resend sends a new verification email and is rate limited", async ({ page }) => {
    const id = uid();
    const email = `resend-${id}@naira.test`;
    await page.goto("/auth/register");
    await page.getByLabel("Your name").fill(`Resend ${id}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Testpass123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await latestEmailLink(email);
    const before = await emailCount(email);

    await hydrated(page);
    await expect(page.getByLabel("Email")).toHaveValue(email);
    await page.waitForTimeout(1500); // Supabase Auth refuses a second email to the same address within max_frequency (1s)
    await page.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByRole("status")).toContainText("new verification link");
    await expect.poll(() => emailCount(email)).toBeGreaterThan(before);

    // The 3-per-15-minutes limit is only observable when the server runs without RATE_LIMIT_SCALE.
    if (process.env.E2E_RATE_LIMITS === "1") {
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Resend verification email" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /\w/ }).first()).toContainText("Too many requests");
    }
  });

  test("password recovery link sets a new password", async ({ page, browser }) => {
    const id = uid();
    const email = `reset-${id}@naira.test`;
    await page.goto("/auth/register");
    await page.getByLabel("Your name").fill(`Reset ${id}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Testpass123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.goto(await latestEmailLink(email));

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto("/auth/forgot");
    await other.getByLabel("Email").fill(email);
    await other.getByRole("button", { name: "Send reset link" }).click();
    await expect(other.getByRole("status")).toContainText("reset link");
    let link = "";
    await expect.poll(async () => (link = await latestEmailLink(email)).includes("type=recovery")).toBe(true);
    await other.goto(link);
    await expect(other).toHaveURL(/\/auth\/reset/);
    await other.getByLabel("New password").fill("Newpass12345");
    await other.getByLabel("Confirm password").fill("Newpass12345");
    await other.getByRole("button", { name: "Update password" }).click();
    await other.waitForURL(/password=updated/);
    await ctx.close();

    await signIn(page, email, "Newpass12345");
    await expect(page).not.toHaveURL(/\/auth/);

    // An expired or reused reset link sends the user back to request a new one.
    const fresh = await browser.newContext();
    const p = await fresh.newPage();
    await p.goto(link);
    await expect(p).toHaveURL(/\/auth\/forgot\?error=link/);
    await expect(p.getByRole("alert").filter({ hasText: /\w/ }).first()).toContainText("reset link is invalid");
    await fresh.close();
  });
});
