import { test, expect, type Page } from "@playwright/test";
import { signIn, hydrated, addPhotos, serviceClient, uid } from "./helpers";

const CHIOMA = "00000000-0000-4000-8000-000000000002";
const PREFIX = "E2E prelaunch";

// Keep reruns independent: archive what this file published and end its paid promotions.
test.afterAll(async () => {
  const db = await serviceClient();
  const { data } = await db.from("listings").select("id").eq("seller_id", CHIOMA).like("title", `${PREFIX}%`);
  const ids = (data ?? []).map((l) => l.id);
  if (ids.length) {
    await db.from("promotion_campaigns").update({ status: "ended" }).in("listing_id", ids).in("status", ["active", "paused"]);
    await db.from("listings").update({ status: "archived" }).in("id", ids);
  }
});

async function fillBasics(page: Page, title: string) {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Phones & electronics" });
  await page.getByLabel("Description").fill("Smart television, 43 inch, with remote and wall bracket. Works perfectly.");
  await page.getByLabel(/^Price \(NGN\)/).fill("150,000");
}

test("state → LGA selects only offer that state's LGAs", async ({ page }) => {
  await signIn(page, "chioma@naira.test");
  await page.goto("/sell");
  await hydrated(page);
  const lga = page.getByLabel("LGA");
  await page.getByLabel("State").selectOption({ label: "Delta" });
  await expect(lga.locator("option")).toHaveCount(26); // 25 LGAs + placeholder
  await expect(lga.locator("option", { hasText: "Oshimili North" })).toHaveCount(1);
  await expect(lga.locator("option", { hasText: "Ikeja" })).toHaveCount(0);
  await lga.selectOption({ label: "Oshimili North" });
  // Changing the state clears the LGA, so an LGA from another state can't be submitted.
  await page.getByLabel("State").selectOption({ label: "Federal Capital Territory" });
  await expect(lga).toHaveValue("");
  await expect(lga.locator("option")).toHaveCount(7);
  await expect(page.getByLabel("State").locator("option")).toHaveCount(38); // 36 states + FCT + placeholder
});

test("photos: minimum to publish, reorder, cover, replace and remove, then a swipeable gallery", async ({ page }) => {
  await signIn(page, "chioma@naira.test");
  await page.goto("/sell");
  await hydrated(page);
  const title = `${PREFIX} photos ${uid()}`;
  await fillBasics(page, title);
  await page.getByLabel("State").selectOption({ label: "Delta" });
  await page.getByLabel("LGA").selectOption({ label: "Oshimili North" });

  // Three photos are not enough for electronics.
  await addPhotos(page, 3);
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add at least 4 photos to publish" }).first()).toBeVisible();

  await addPhotos(page, 2);
  const items = page.getByTestId("images-item");
  await expect(page.getByTestId("images-count")).toContainText("5 of 10 photos");
  const srcs = async () => items.locator("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  const before = await srcs();

  await page.getByRole("button", { name: "Make photo 3 the cover" }).click();
  expect((await srcs())[0]).toBe(before[2]);
  await expect(items.first().getByText("Cover")).toBeVisible();

  await page.getByRole("button", { name: "Move photo 2 later" }).click();
  expect((await srcs())[2]).toBe(before[0]);

  await page.getByRole("button", { name: "Remove photo 5" }).click();
  await expect(items).toHaveCount(4);

  const old2 = (await srcs())[1];
  await page.getByTestId("images-replace-input").evaluate((el) => el.removeAttribute("aria-hidden"));
  await page.getByRole("button", { name: "Replace photo 2" }).click();
  await page.getByTestId("images-replace-input").setInputFiles({ name: "new.png", mimeType: "image/png", buffer: (await import("./helpers")).PNG_1x1 });
  await expect.poll(async () => (await srcs())[1]).not.toBe(old2);
  const finalOrder = await srcs();

  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page).toHaveURL(/\/dashboard\/listings\?saved=/);
  const id = new URL(page.url()).searchParams.get("saved")!;

  // One listing with four photos, saved in the chosen order with the chosen cover.
  const db = await serviceClient();
  const { data: imgs } = await db.from("listing_images").select("url, position").eq("listing_id", id).order("position");
  expect(imgs?.map((i) => i.url)).toEqual(finalOrder);
  const { count } = await db.from("listings").select("id", { count: "exact", head: true }).eq("title", title);
  expect(count).toBe(1);

  await page.goto(`/listing/${id}`);
  await expect(page.getByTestId("gallery-counter")).toHaveText("1 / 4");
  await page.getByRole("button", { name: "Next photo" }).first().click();
  await expect(page.getByTestId("gallery-counter")).toHaveText("2 / 4");
  await page.getByRole("tab", { name: "Show photo 4" }).click();
  await expect(page.getByTestId("gallery-counter")).toHaveText("4 / 4");
  await expect(page.getByText("Oshimili North, Delta")).toBeVisible();
});

test("publishing with a paid promotion: payment first, then a promotion with an expiry date", async ({ page }) => {
  await signIn(page, "chioma@naira.test");
  await page.goto("/sell");
  await hydrated(page);
  const title = `${PREFIX} television ${uid()}`;
  await addPhotos(page, 4);
  await fillBasics(page, title);
  await page.getByLabel("State").selectOption({ label: "Delta" });
  await page.getByLabel("LGA").selectOption({ label: "Oshimili North" });

  const step = page.getByTestId("promotion-step");
  await expect(step.getByRole("radio", { name: "Standard listing" })).toBeChecked();
  await expect(step).toContainText("FREE");
  await expect(step).toContainText("₦2,000");
  await expect(step).toContainText("₦5,000");
  await step.getByRole("radio", { name: "Promote for 7 days" }).check();
  await page.getByRole("button", { name: "Publish and pay for promotion" }).click();

  // The listing is live as a standard listing before payment; nothing is promoted yet.
  await expect(page.getByText("Development mock checkout")).toBeVisible();
  const db = await serviceClient();
  const { data: listing } = await db.from("listings").select("id, status").eq("title", title).single();
  expect(listing?.status).toBe("active");
  const { count: before } = await db.from("promotion_campaigns").select("id", { count: "exact", head: true }).eq("listing_id", listing!.id);
  expect(before).toBe(0);

  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "succeeded");
  await expect(page.getByText("Your listing is promoted for 7 days.")).toBeVisible();

  await page.goto("/dashboard/promotions");
  const row = page.getByTestId("campaign").filter({ hasText: title }).first();
  await expect(row).toContainText("Paid (Promote for 7 days, ₦2,000)");
  await expect(row.getByTestId("promo-status")).toContainText(/active, ends \d{2}\/\d{2}\/\d{4}/);
  await page.goto("/dashboard");
  await expect(page.getByTestId("promotion-status")).toContainText(title);

  // Expiry: once the end date passes it is no longer served and shows as ended.
  await db.from("promotion_campaigns").update({ ends_at: new Date(Date.now() - 60_000).toISOString() }).eq("listing_id", listing!.id);
  await page.goto("/dashboard/promotions");
  await expect(page.getByTestId("campaign").filter({ hasText: title }).first().getByTestId("promo-status")).toContainText("ended");

  // Homepage location search: Delta + Oshimili North + keyword finds it; Lagos does not.
  await page.goto("/");
  await hydrated(page);
  const form = page.getByTestId("home-search");
  await form.getByLabel("What are you looking for?").fill(title);
  await form.getByLabel("State").selectOption({ label: "Delta" });
  await form.getByLabel("LGA").selectOption({ label: "Oshimili North" });
  await form.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/region=\d+.*area=\d+/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("in Oshimili North, Delta");
  await expect(page.getByTestId("product-card").filter({ hasText: title })).toHaveCount(1);
  const lagos = new URL(page.url());
  lagos.searchParams.delete("area");
  const { data: lagosRow } = await db.from("regions").select("id").eq("country_code", "NG").eq("name", "Lagos").single();
  lagos.searchParams.set("region", String(lagosRow!.id));
  await page.goto(lagos.toString());
  await expect(page.getByTestId("product-card").filter({ hasText: title })).toHaveCount(0);
});

test("standard publishing needs no payment", async ({ page }) => {
  await signIn(page, "chioma@naira.test");
  await page.goto("/sell");
  await hydrated(page);
  const title = `${PREFIX} free ${uid()}`;
  await addPhotos(page, 4);
  await fillBasics(page, title);
  await page.getByLabel("LGA").selectOption({ label: "Ikeja" });
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page).toHaveURL(/\/dashboard\/listings\?saved=/);
  const db = await serviceClient();
  const { data } = await db.from("platform_payments").select("id, listing:listings!inner(title)").eq("listing.title", title);
  expect(data).toHaveLength(0);
});

test("the 15-listing free allowance, the upgrade path, and existing listings left live", async ({ page }) => {
  const db = await serviceClient();
  const id = uid();
  const email = `limit-${id}@example.test`;
  const { data: created, error } = await db.auth.admin.createUser({ email, password: "Testpass123", email_confirm: true, user_metadata: { display_name: `Limit ${id}`, country_code: "NG" } });
  expect(error).toBeNull();
  const userId = created.user!.id;
  const { data: lagos } = await db.from("regions").select("id").eq("country_code", "NG").eq("name", "Lagos").single();
  await db.from("seller_profiles").insert({ user_id: userId, shop_name: `Limit Shop ${id}`, slug: `limit-shop-${id}`, country_code: "NG", region_id: lagos!.id });
  const { data: cat } = await db.from("categories").select("id").eq("slug", "phones-electronics").single();
  // 17 live listings, as an existing seller above the new allowance would have.
  await db.from("listings").insert(Array.from({ length: 17 }, (_, i) => ({
    seller_id: userId, country_code: "NG", region_id: lagos!.id, title: `Older item ${i + 1}`, description: "Listed before the allowance changed",
    category_id: cat!.id, price_minor: 100000, currency: "NGN", condition: "used_good" as const,
  })));

  await signIn(page, email, "Testpass123");
  await page.goto("/dashboard");
  await expect(page.getByTestId("allowance")).toContainText("17 active listings out of 15");
  await expect(page.getByTestId("allowance")).toContainText("They all stay live");

  await page.goto("/sell");
  await hydrated(page);
  await expect(page.getByTestId("limit-warning")).toBeVisible();
  await addPhotos(page, 4);
  await fillBasics(page, `Limit test ${id}`);
  await page.getByLabel("LGA").selectOption({ label: "Ikeja" });
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page.getByText(/reached your limit of 15 active listings/)).toBeVisible();
  await expect(page.getByRole("link", { name: "See upgrade options" })).toBeVisible();
  const { count: active } = await db.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", userId).eq("status", "active");
  expect(active).toBe(17); // nothing was unpublished

  // Draft is still possible at the limit.
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/dashboard\/listings\?saved=/);

  // Upgrade (mock payment), then the draft can be published.
  await page.goto("/dashboard/plan");
  await page.getByRole("button", { name: "Choose Trader Plus" }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "succeeded");
  await page.goto("/dashboard/listings?status=draft");
  await page.getByTestId("my-listing").filter({ hasText: `Limit test ${id}` }).getByRole("link", { name: `Limit test ${id}` }).click();
  await hydrated(page);
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page).toHaveURL(/\/dashboard\/listings\?saved=/);
  await page.goto("/dashboard");
  await expect(page.getByTestId("allowance")).toContainText("18 active listings out of 200");
});

test("Ghana keeps its own regions, no LGA field and no naira promotions", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "nm_country", value: "GH", url: baseURL! }]);
  await page.goto("/");
  const form = page.getByTestId("home-search");
  await expect(form.getByLabel("Region")).toBeVisible();
  await expect(form.getByLabel("Region").locator("option")).toHaveCount(17); // 16 regions + "All"
  await expect(form.getByLabel("LGA")).toHaveCount(0);
  await form.getByLabel("Region").selectOption({ label: "Greater Accra" });
  await form.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("product-card").filter({ hasText: "Cooking pot set" })).toHaveCount(1);
  await expect(page.getByTestId("product-card").first()).toContainText("GH₵");

  await signIn(page, "kwame@naira.test");
  await page.goto("/sell");
  await expect(page.getByTestId("promotion-step")).toHaveCount(0);
  await expect(page.getByLabel("LGA")).toHaveCount(0);
});

test("homepage search fits a phone screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-search")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
