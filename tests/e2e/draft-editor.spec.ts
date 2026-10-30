import { test, expect, type Page } from "@playwright/test";
import { signIn, hydrated, serviceClient, uid } from "./helpers";

// Regression tests for the draft editor link. Run them against the production build: the original hang (the click did
// nothing after the new-listing page had been opened in the same tab) only happens with production client navigation.

async function sellerWithDraft() {
  const db = await serviceClient();
  const id = uid();
  const email = `drafts-${id}@example.test`;
  const { data: created, error } = await db.auth.admin.createUser({
    email, password: "Testpass123", email_confirm: true, user_metadata: { display_name: `Drafts ${id}`, country_code: "NG" },
  });
  expect(error).toBeNull();
  const userId = created.user!.id;
  const { data: lagos } = await db.from("regions").select("id").eq("country_code", "NG").eq("name", "Lagos").single();
  const { data: ikeja } = await db.from("areas").select("id").eq("region_id", lagos!.id).eq("name", "Ikeja").single();
  const { data: cat } = await db.from("categories").select("id").eq("slug", "phones-electronics").single();
  await db.from("seller_profiles").insert({ user_id: userId, shop_name: `Drafts Shop ${id}`, slug: `drafts-shop-${id}`, country_code: "NG", region_id: lagos!.id });
  const title = `Draft radio ${id}`;
  const { data: listing } = await db.from("listings").insert({
    seller_id: userId, country_code: "NG", region_id: lagos!.id, area_id: ikeja!.id, title, status: "draft",
    description: "Vintage radio saved as a draft, not yet published.", category_id: cat!.id, price_minor: 4_500_000, currency: "NGN",
    condition: "used_good" as const,
  }).select("id").single();
  const photos = ["/seed/phone.svg", "/seed/fabric.svg"];
  await db.from("listing_images").insert(photos.map((url, position) => ({ listing_id: listing!.id, storage_path: `seed${url}`, url, position, alt_text: title })));
  return { email, title, listingId: listing!.id, photos: photos.length };
}

async function expectEditorFor(page: Page, draft: Awaited<ReturnType<typeof sellerWithDraft>>) {
  await expect(page).toHaveURL(new RegExp(`/dashboard/listings/${draft.listingId}/edit$`));
  await expect(page.getByRole("heading", { level: 1, name: "Edit listing" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(draft.title);
  await expect(page.getByLabel(/^Price \(NGN\)/)).toHaveValue("45000");
  await expect(page.getByTestId("images-item")).toHaveCount(draft.photos);
  await expect(page.getByRole("button", { name: "Publish listing" })).toBeVisible();
}

test("a draft opens in the editor after the new-listing page was used in the same tab", async ({ page }) => {
  const draft = await sellerWithDraft();
  await signIn(page, draft.email, "Testpass123");

  // The original failure: new-listing page first, then the drafts list in the same tab, then the draft's title.
  await page.goto("/dashboard/listings/new");
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/dashboard/listings?status=draft");
  await hydrated(page);
  await page.getByTestId("my-listing").filter({ hasText: draft.title }).getByRole("link", { name: draft.title }).click();
  await expectEditorFor(page, draft);

  // Back returns to the drafts list, forward to the same editor.
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/listings\?status=draft$/);
  await expect(page.getByTestId("my-listing").filter({ hasText: draft.title })).toBeVisible();
  await page.goForward();
  await expectEditorFor(page, draft);
});

test("a draft editor URL opened directly in a new tab loads the draft", async ({ page, context }) => {
  const draft = await sellerWithDraft();
  await signIn(page, draft.email, "Testpass123");
  const tab = await context.newPage();
  await tab.goto(`/dashboard/listings/${draft.listingId}/edit`);
  await expectEditorFor(tab, draft);
});

test("sellers cannot open another seller's draft, and guests are sent to sign in", async ({ page, browser }) => {
  const draft = await sellerWithDraft();
  await signIn(page, "chioma@naira.test");
  // The editor only loads a listing owned by the signed-in seller (and RLS hides other sellers' drafts), so this is "not found".
  await page.goto(`/dashboard/listings/${draft.listingId}/edit`);
  await expect(page.getByText("We couldn't find that page")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveCount(0);
  await expect(page.getByText(draft.title)).toHaveCount(0);

  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(`/dashboard/listings/${draft.listingId}/edit`);
  await expect(g).toHaveURL(/\/auth\/login\?next=/);
  await guest.close();
});
