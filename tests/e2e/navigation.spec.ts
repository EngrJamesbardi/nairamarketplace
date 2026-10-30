import { test, expect } from "@playwright/test";
import { signIn, hydrated, serviceClient, uid } from "./helpers";

// Regression tests for client-side navigations that used to hang in production builds: the click (or a server action's
// redirect) did nothing because a root app/loading.tsx left the Next.js 15.5 router suspended forever. Run them against
// the production build; `next dev` did not show the hang.

async function sellerWithActiveListing() {
  const db = await serviceClient();
  const id = uid();
  const email = `nav-${id}@example.test`;
  const { data: created, error } = await db.auth.admin.createUser({
    email, password: "Testpass123", email_confirm: true, user_metadata: { display_name: `Nav ${id}`, country_code: "NG" },
  });
  expect(error).toBeNull();
  const userId = created.user!.id;
  const { data: lagos } = await db.from("regions").select("id").eq("country_code", "NG").eq("name", "Lagos").single();
  const { data: cat } = await db.from("categories").select("id").eq("slug", "phones-electronics").single();
  await db.from("seller_profiles").insert({ user_id: userId, shop_name: `Nav Shop ${id}`, slug: `nav-shop-${id}`, country_code: "NG", region_id: lagos!.id });
  // A realistic dashboard: several live listings and a draft, so the page has many links being prefetched.
  const title = `Nav speaker ${id}`;
  const rows: { title: string; status: "active" | "draft" }[] = Array.from({ length: 6 }, (_, i) => ({ title: i === 0 ? title : `Nav item ${i} ${id}`, status: "active" }));
  rows.push({ title: `Nav draft ${id}`, status: "draft" });
  const { data: listings } = await db.from("listings").insert(rows.map((r) => ({
    seller_id: userId, country_code: "NG", region_id: lagos!.id, title: r.title, status: r.status, description: "Bluetooth speaker in good working order.",
    category_id: cat!.id, price_minor: 2_000_000, currency: "NGN", condition: "used_good" as const,
  }))).select("id, title");
  const draftId = listings!.find((l) => l.title === `Nav draft ${id}`)!.id;
  return { email, title, draftTitle: `Nav draft ${id}`, draftId };
}

test("every seller dashboard tab opens from the overview", async ({ page }) => {
  const seller = await sellerWithActiveListing();
  await signIn(page, seller.email, "Testpass123");
  const nav = page.getByRole("navigation", { name: "Seller dashboard" });
  for (const [label, path, heading] of [
    ["Promotions", "/dashboard/promotions", "Promotions"],
    ["Listings", "/dashboard/listings", "My listings"],
    ["Credits", "/dashboard/credits", "Promotion credits"],
    ["Plan", "/dashboard/plan", "Seller plan"],
  ] as const) {
    await page.goto("/dashboard");
    await hydrated(page);
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page, label).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 }), label).toHaveText(heading);
  }
});

test("pausing and reactivating a listing updates the page without a reload", async ({ page }) => {
  const seller = await sellerWithActiveListing();
  await signIn(page, seller.email, "Testpass123");
  await page.goto("/dashboard/listings");
  await hydrated(page);
  const row = page.getByTestId("my-listing").filter({ hasText: seller.title });
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(page).toHaveURL(/[?&]updated=/);
  await expect(row.getByRole("button", { name: "Reactivate" })).toBeVisible();

  await row.getByRole("button", { name: "Reactivate" }).click();
  await expect(row.getByRole("button", { name: "Pause" })).toBeVisible();
});

test("a draft opens in the editor after the new-listing page was used in the same tab", async ({ page }) => {
  const seller = await sellerWithActiveListing();
  await signIn(page, seller.email, "Testpass123");
  await page.goto("/dashboard/listings/new");
  await hydrated(page);
  await page.goto("/dashboard/listings?status=draft");
  await hydrated(page);
  await page.getByTestId("my-listing").filter({ hasText: seller.draftTitle }).getByRole("link", { name: seller.draftTitle }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/listings/${seller.draftId}/edit$`));
  await expect(page.getByLabel("Title")).toHaveValue(seller.draftTitle);
});

test("searching from the home page shows results", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const box = page.getByRole("searchbox").first();
  await box.fill("phone");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/search\?.*q=phone/);
  await expect(page.getByTestId("product-card").first()).toBeVisible();
});
