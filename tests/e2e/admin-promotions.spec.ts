import { test, expect } from "@playwright/test";
import { signIn, serviceClient } from "./helpers";

test("admin manages promotion packages, listing allowances and photo minimums", async ({ page }) => {
  await signIn(page, "admin@naira.test");

  await page.goto("/admin/promotions");
  const ng = page.getByTestId("packages-NG");
  await expect(ng.getByRole("textbox", { name: "Name" }).first()).toHaveValue("Promote for 7 days");
  await expect(page.getByTestId("packages-GH")).toContainText("No packages");

  // Change the 7-day price and duration, then put them back.
  const first = ng.locator("form").first();
  await first.getByLabel("Price (NGN)").fill("2500");
  await first.getByLabel("Days").fill("8");
  await first.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  const db = await serviceClient();
  const { data: pkg } = await db.from("promotion_packages").select("price_minor, days").eq("code", "promote-7").single();
  expect(pkg).toEqual({ price_minor: 250000, days: 8 });
  await db.from("promotion_packages").update({ price_minor: 200000, days: 7 }).eq("code", "promote-7");

  await page.goto("/admin/campaigns?view=expired");
  await expect(page.getByRole("heading", { name: "Promotion campaigns" })).toBeVisible();
  await page.goto("/admin/countries");
  await expect(page.getByLabel("Free active listings (default 15)").first()).toHaveValue("15");
  await page.goto("/admin/plans");
  await expect(page.getByText("free allowance 15").first()).toBeVisible();
  await page.goto("/admin/categories");
  await expect(page.getByLabel("Photos needed to publish").first()).toHaveValue("4");
});

test("non-admins cannot reach promotion package management", async ({ page }) => {
  await signIn(page, "chioma@naira.test");
  await page.goto("/admin/promotions");
  await expect(page).not.toHaveURL(/\/admin\/promotions/);
});
