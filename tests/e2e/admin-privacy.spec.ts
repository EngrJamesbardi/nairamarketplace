import { test, expect } from "@playwright/test";
import { signIn, registerAndVerify, uid, serviceClient, hydrated } from "./helpers";

const KWAME = "00000000-0000-4000-8000-000000000004";

test.describe("admin & moderation", () => {
  test.afterAll(async () => {
    const db = await serviceClient();
    await db.from("profiles").update({ status: "active", suspended_reason: null, suspended_until: null }).eq("id", KWAME);
  });

  test("members cannot open the admin area", async ({ page }) => {
    await signIn(page, "buyer@naira.test");
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("admin suspends a seller, their shop disappears, the action is audited, then reinstates", async ({ page, browser, baseURL }) => {
    await signIn(page, "admin@naira.test");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /admin|overview/i }).first()).toBeVisible();

    await page.goto("/admin/users?q=kwame");
    await hydrated(page);
    const row = page.getByTestId("user-row").filter({ hasText: "kwame@naira.test" });
    await row.getByLabel("Suspension reason").fill("E2E test suspension");
    await row.getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByRole("status")).toContainText("audit log");
    await expect(page.getByTestId("user-row").filter({ hasText: "kwame@naira.test" })).toContainText("suspended");

    const guest = await browser.newContext({ baseURL });
    const gp = await guest.newPage();
    await gp.goto("/s/accra-home-goods");
    await expect(gp.getByText("We couldn't find that page")).toBeVisible();
    await guest.close();

    await page.goto("/admin/audit?action=user.");
    await expect(page.getByTestId("audit-row").first()).toContainText("user.suspended");

    await page.goto("/admin/users?q=kwame");
    await hydrated(page);
    await page.getByTestId("user-row").filter({ hasText: "kwame@naira.test" }).getByRole("button", { name: "Reinstate" }).click();
    await expect(page.getByTestId("user-row").filter({ hasText: "kwame@naira.test" })).toContainText("active");
  });
});

test("member exports data, deactivates, reactivates and deletes their account", async ({ page }) => {
  const email = `privacy-${uid()}@example.test`;
  await registerAndVerify(page, "Ada Privacy", email);
  await page.goto("/account");
  await hydrated(page);

  const res = await page.request.get("/api/account/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const data = await res.json();
  expect(data.account.email).toBe(email);
  expect(data.profile.display_name).toBe("Ada Privacy");

  await page.getByRole("button", { name: "Deactivate my account" }).click();
  await expect(page.getByText("Your account is deactivated")).toBeVisible();
  await page.reload();
  await hydrated(page);
  await page.getByRole("button", { name: "Reactivate my account" }).click();
  await expect(page.getByText("Welcome back")).toBeVisible();

  await page.reload();
  await hydrated(page);
  await page.getByText("Delete account permanently").click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("Your account has been deleted")).toBeVisible();

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Testpass123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password")).toBeVisible();
});
