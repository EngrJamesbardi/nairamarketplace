import { test, expect } from "@playwright/test";
import { signIn, hydrated, serviceClient } from "./helpers";

const TUNDE = "00000000-0000-4000-8000-000000000003";

async function balance(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/credits");
  return Number((await page.getByTestId("credit-balance").innerText()).replace(/\D/g, ""));
}

test.afterAll(async () => {
  const db = await serviceClient();
  await db.from("promotion_campaigns").update({ status: "cancelled" }).eq("seller_id", TUNDE).in("status", ["active", "paused"]);
});

test("seller buys credits through a verified (mock) payment, promotes a listing, and sees real impressions and clicks", async ({ page, browser, baseURL }) => {
  await signIn(page, "tunde@naira.test");
  const start = await balance(page);

  // A return URL alone grants nothing: start a checkout, then jump straight to the return page.
  await page.getByRole("button", { name: "Buy Starter" }).click();
  await expect(page.getByText("Development mock checkout")).toBeVisible();
  const ref = decodeURIComponent(page.url().split("/pay/mock/")[1]);
  await page.goto(`/pay/return?ref=${encodeURIComponent(ref)}`);
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "pending");
  expect(await balance(page)).toBe(start);

  // Complete it through the signed webhook path.
  await page.goto(`/pay/mock/${encodeURIComponent(ref)}`);
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "succeeded");
  await expect(page.getByText("50 credits have been added")).toBeVisible();
  expect(await balance(page)).toBe(start + 50);

  // A declined payment adds nothing.
  await page.getByRole("button", { name: "Buy Starter" }).click();
  await page.getByRole("button", { name: "Simulate declined payment" }).click();
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "failed");
  expect(await balance(page)).toBe(start + 50);

  // Promote the first listing on the homepage for 1 day (25 credits).
  await page.goto("/dashboard/promotions");
  await hydrated(page);
  const title = (await page.getByLabel("Listing").locator("option").first().innerText()).trim();
  await page.getByLabel(/Homepage/).check();
  await page.getByLabel("Days").fill("1");
  await page.getByRole("button", { name: "Start promotion" }).click();
  await expect(page.getByText("Promotion started")).toBeVisible();
  expect(await balance(page)).toBe(start + 50 - 25);

  // A guest sees it, clearly labelled, and opens it.
  const guest = await browser.newContext({ baseURL });
  const gp = await guest.newPage();
  await gp.goto("/");
  const card = gp.locator('[data-sponsored="true"]').filter({ hasText: title });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Sponsored");
  await gp.waitForTimeout(1800); // on screen for > 1s counts as an impression
  await card.getByRole("link").first().click();
  await expect(gp).toHaveURL(/\/listing\//);
  await guest.close();

  await expect(async () => {
    await page.goto("/dashboard/promotions");
    const c = page.getByTestId("campaign").filter({ hasText: title }).first();
    await expect(c.getByTestId("impressions")).toHaveText("1", { timeout: 1000 });
    await expect(c.getByTestId("clicks")).toHaveText("1", { timeout: 1000 });
  }).toPass({ timeout: 15000 });

  // Stop it.
  await hydrated(page);
  await page.getByTestId("campaign").filter({ hasText: title }).first().getByRole("button", { name: /Stop/ }).click();
  await expect(page.getByText("Promotion stopped")).toBeVisible();
});

test("seller upgrades to a paid plan and gets the higher listing allowance", async ({ page }) => {
  await signIn(page, "tunde@naira.test");
  await page.goto("/dashboard/plan");
  const plan = page.getByRole("listitem").filter({ hasText: "Trader Plus" });
  await plan.getByRole("button").click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "succeeded");
  await page.goto("/dashboard/plan");
  await expect(page.getByTestId("current-plan")).toContainText("Trader Plus");
  await expect(page.getByTestId("current-plan")).toContainText("of 200 active listings");
});

test("pricing page explains free use and optional extras", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Simple, optional pricing" })).toBeVisible();
  await expect(page.getByText("No commission on sales, ever")).toBeVisible();
  await expect(page.getByText("Starter · 50 credits")).toBeVisible();
});
