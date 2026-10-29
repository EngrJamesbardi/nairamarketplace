import { test, expect } from "@playwright/test";
import { registerAndVerify, uid, PNG_1x1, signIn, serviceClient } from "./helpers";

test("guest can browse, search, filter and switch country", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Africa's Open Market/ })).toBeVisible();
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  // prices are formatted in the market currency
  await expect(page.getByText("₦18,000").first()).toBeVisible();

  await page.goto("/search?q=smartphone");
  await expect(page.getByTestId("product-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /Smartphone 128GB/ })).toBeVisible();

  await page.goto("/search?category=fashion-accessories&negotiable=1");
  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allInnerTexts()) expect(text).toContain("Negotiable");

  await page.goto("/search?min=20000&max=30000");
  for (const text of await page.getByTestId("product-card").allInnerTexts()) expect(text).toMatch(/₦2\d,\d{3}/);

  // Switch market to Ghana: prices change to cedi, no naira listings shown
  await page.goto("/");
  await page.locator("select[name=country]:visible").selectOption("GH");
  await expect(page.getByText(/Browsing Ghana/)).toBeVisible();
  await expect(page.getByText(/GH₵|₵/).first()).toBeVisible();
  await expect(page.getByText("₦18,000")).toHaveCount(0);
  await page.locator("select[name=country]:visible").selectOption("NG");
  await expect(page.getByText(/Browsing Nigeria/)).toBeVisible();
});

test("protected pages redirect guests to sign in", async ({ page }) => {
  for (const path of ["/dashboard", "/messages", "/admin", "/account"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
  }
});

test("new user registers, verifies email, opens a storefront and publishes a listing", async ({ page }) => {
  const id = uid();
  const email = `seller-${id}@example.test`;
  await registerAndVerify(page, `Seller ${id}`, email);

  await page.getByRole("link", { name: "Set up a storefront" }).click();
  await page.getByLabel("Shop name").fill(`Test Shop ${id}`);
  await expect(page.getByLabel("Shop web address")).toHaveValue(`test-shop-${id}`);
  await page.getByLabel("State").selectOption({ label: "Lagos" });
  await page.getByLabel("City or area").fill("Yaba");
  await page.getByRole("button", { name: "Create my storefront" }).click();
  await expect(page.getByText("Your storefront is live")).toBeVisible();

  await page.goto("/sell");
  await expect(page.getByRole("heading", { name: "New listing" })).toBeVisible();
  await page.getByTestId("images-input").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG_1x1 });
  await expect(page.getByAltText("Photo 1")).toBeVisible();
  const title = `Vintage radio ${id}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Phones & electronics" });
  await page.getByLabel("Description").fill("Working vintage radio with original case. Pickup in Yaba.");
  await page.getByLabel(/^Price \(NGN\)/).fill("45,000");
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page).toHaveURL(/\/dashboard\/listings\?saved=/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // Public search finds it, with exact price in naira
  // (search is typo-tolerant, so similar titles from earlier runs may also appear — the exact match ranks first)
  await page.goto(`/search?q=${encodeURIComponent("vintage radio " + id)}`);
  await expect(page.getByTestId("product-card").first()).toContainText(title);
  await expect(page.getByTestId("product-card").first()).toContainText("₦45,000");

  // Manage: pause hides it from search, reactivate shows it again
  await page.goto("/dashboard/listings");
  await page.getByTestId("my-listing").filter({ hasText: title }).getByRole("button", { name: "Pause" }).click();
  await expect(page).toHaveURL(/[?&]updated=/); // wait for the server action before navigating away
  await page.goto(`/search?q=${encodeURIComponent("vintage radio " + id)}`);
  await expect(page.getByTestId("product-card").filter({ hasText: title })).toHaveCount(0);
  await page.goto("/dashboard/listings");
  await page.getByTestId("my-listing").filter({ hasText: title }).getByRole("button", { name: "Reactivate" }).click();
  await expect(page).toHaveURL(/[?&]updated=/);
  await page.goto(`/search?q=${encodeURIComponent("vintage radio " + id)}`);
  await expect(page.getByTestId("product-card").filter({ hasText: title })).toHaveCount(1);
});

test("publishing again after a lost response does not create a duplicate listing", async ({ page }) => {
  await signIn(page, "chioma@naira.test");
  await page.goto("/sell");
  await page.getByTestId("images-input").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG_1x1 });
  await expect(page.getByAltText("Photo 1")).toBeVisible();
  const title = `Ceiling fan ${uid()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Appliances" });
  await page.getByLabel("Description").fill("Standing fan, three speeds, works well. Pickup only.");
  await page.getByLabel(/^Price \(NGN\)/).fill("18,000");

  // The server saves the first submission but its response never reaches the phone (flaky network / lost redirect).
  let dropped = false;
  await page.route("**/dashboard/listings/new", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect.poll(() => dropped).toBe(true);
  await expect(page.getByText(/Connection problem/)).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(title); // nothing the seller typed is lost

  // The seller taps Publish again on the same form.
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page).toHaveURL(/\/dashboard\/listings\?saved=/);

  const db = await serviceClient();
  const { data } = await db.from("listings").select("id").eq("title", title);
  expect(data).toHaveLength(1);
});
