import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export const uid = () => Math.random().toString(36).slice(2, 8);

/** Fetch the newest email sent to `to` from the local Mailpit inbox and return the first link in it. */
export async function latestEmailLink(to: string, timeoutMs = 20000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const json = (await res.json()) as { messages: { ID: string }[] };
    if (json.messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${json.messages[0].ID}`)).json()) as { HTML: string; Text: string };
      const m = /href="([^"]+)"/.exec(msg.HTML) ?? /(https?:\/\/\S+)/.exec(msg.Text);
      if (m) return m[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email for ${to}`);
}

export async function registerAndVerify(page: Page, name: string, email: string, password = "Testpass123") {
  await page.goto("/auth/register");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const link = await latestEmailLink(email);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: new RegExp(`Welcome, ${name}`) })).toBeVisible();
}

export async function signIn(page: Page, email: string, password = "Password123!") {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
}

/** A tiny valid PNG (1x1) for upload tests. */
export const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
