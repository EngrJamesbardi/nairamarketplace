import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers";

// Automated WCAG 2.1 A/AA checks (axe-core). This catches a subset of issues; manual testing with
// screen readers (TalkBack, VoiceOver) is still required before launch.
async function check(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

test("public pages have no serious accessibility violations", async ({ page }) => {
  for (const p of ["/", "/search?q=demo", "/s/chiomas-closet", "/pricing", "/auth/login", "/auth/register", "/install"]) await check(page, p);
  await page.goto("/search");
  const href = await page.getByTestId("product-card").first().getByRole("link").first().getAttribute("href");
  await check(page, href!);
});

test("signed-in pages have no serious accessibility violations", async ({ page }) => {
  await signIn(page, "chioma@naira.test");
  for (const p of ["/dashboard", "/dashboard/listings/new", "/dashboard/credits", "/dashboard/promotions", "/messages", "/account", "/notifications"]) await check(page, p);
});

test("dark mode keeps text readable (no contrast failures)", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "nm_theme", value: "dark", url: baseURL! }]);
  for (const p of ["/", "/search?q=demo", "/pricing", "/auth/login"]) {
    await page.goto(p);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const { violations } = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(violations.flatMap((v) => v.nodes.map((n) => `${p}: ${n.target.join(" ")} ${n.any[0]?.message ?? ""}`))).toEqual([]);
  }
});
