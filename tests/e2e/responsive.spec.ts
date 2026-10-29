import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

const PUBLIC = ["/", "/search", "/search?category=phones-electronics", "/s/tunde-gadgets", "/pricing", "/legal/terms", "/install", "/auth/login", "/auth/register"];
const SELLER = ["/dashboard", "/dashboard/listings", "/dashboard/listings/new", "/dashboard/offers", "/dashboard/credits", "/dashboard/promotions", "/dashboard/plan", "/messages", "/account", "/notifications"];

async function noHorizontalScroll(page: import("@playwright/test").Page, path: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test("public pages fit the screen without sideways scrolling", async ({ page }) => {
  for (const path of PUBLIC) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await noHorizontalScroll(page, path);
  }
  // listing detail
  await page.goto("/search");
  await page.getByTestId("product-card").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/listing\//);
  await noHorizontalScroll(page, "listing detail");
});

test("seller pages fit the screen without sideways scrolling", async ({ page }) => {
  await signIn(page, "tunde@naira.test");
  for (const path of SELLER) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await noHorizontalScroll(page, path);
  }
});

test("navigation adapts: bottom tab bar on phones, header links on desktop", async ({ page, isMobile }) => {
  await page.goto("/");
  const bottom = page.getByRole("navigation", { name: /primary|bottom|main/i }).last();
  if (isMobile) {
    await expect(bottom).toBeVisible();
    const box = await bottom.boundingBox();
    const vh = page.viewportSize()!.height;
    expect(box!.y + box!.height).toBeGreaterThan(vh - 4);
  } else {
    await expect(page.getByRole("link", { name: /Sell/ }).first()).toBeVisible();
  }
});

test("tap targets in the bottom bar are at least 44px tall", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  await page.goto("/");
  const links = page.locator("nav").last().getByRole("link");
  const n = await links.count();
  expect(n).toBeGreaterThan(2);
  for (let i = 0; i < n; i++) {
    const b = await links.nth(i).boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
});
