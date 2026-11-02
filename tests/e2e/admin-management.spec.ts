import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signIn, uid, serviceClient, hydrated, PNG_1x1 } from "./helpers";

/**
 * Administrator account, shop and listing management: close / reopen / permanently delete accounts, suspend / close /
 * reinstate / delete shops, permanently delete listings (with their photos), and the safety guards.
 * Fixtures are made with the service key under @example.test addresses, which the e2e teardown recognises.
 */
test.describe.configure({ mode: "serial" });

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const PASSWORD = "Testpass123";

async function makeSeller(db: SupabaseClient, tag: string) {
  const email = `seller-${tag}@example.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: `Mgmt ${tag}`, country_code: "NG" } });
  if (error) throw error;
  const id = data.user.id;
  const shop = await db.from("seller_profiles").insert({ user_id: id, shop_name: `Mgmt Shop ${tag}`, slug: `mgmt-shop-${tag}`, seller_type: "individual", country_code: "NG" });
  if (shop.error) throw shop.error;
  return { id, email };
}

async function makeListing(db: SupabaseClient, sellerId: string, title: string) {
  const { data: cat } = await db.from("categories").select("id").eq("slug", "home-furniture").single();
  const { data: l, error } = await db.from("listings").insert({
    seller_id: sellerId, country_code: "NG", title, description: "Listing used by the admin management end-to-end test.",
    category_id: cat!.id, price_minor: 100000, currency: "NGN", price_type: "fixed", condition: "new", quantity: 1, status: "active",
  }).select("id").single();
  if (error) throw error;
  const path = `${sellerId}/${crypto.randomUUID()}.png`;
  const up = await db.storage.from("listing-images").upload(path, PNG_1x1, { contentType: "image/png" });
  if (up.error) throw up.error;
  const img = await db.from("listing_images").insert({ listing_id: l.id, storage_path: path, url: db.storage.from("listing-images").getPublicUrl(path).data.publicUrl, position: 0 });
  if (img.error) throw img.error;
  return { id: l.id as string, path };
}

async function fileExists(db: SupabaseClient, path: string) {
  const [folder, name] = path.split("/");
  const { data } = await db.storage.from("listing-images").list(folder, { search: name });
  return (data ?? []).some((f) => f.name === name);
}

async function publicCanSee(listingId: string) {
  const { data } = await anon().from("listings").select("id").eq("id", listingId);
  return (data ?? []).length === 1;
}

async function openDanger(page: Page, row: ReturnType<Page["getByTestId"]>, summary: string, reason: string, word: string) {
  await row.getByText(summary).click();
  await row.getByLabel("Reason for deletion").fill(reason);
  await row.getByLabel(`Type ${word} to confirm`).fill(word);
}

test("admin permanently deletes a listing and its photo; the action is audited", async ({ page }) => {
  const db = await serviceClient();
  const tag = uid();
  const seller = await makeSeller(db, tag);
  const title = `Mgmt delete listing ${tag}`;
  const listing = await makeListing(db, seller.id, title);
  expect(await fileExists(db, listing.path)).toBe(true);

  await signIn(page, "admin@naira.test");
  await page.goto(`/admin/listings?tab=all&q=${encodeURIComponent(title)}`);
  await hydrated(page);
  const item = page.getByTestId("moderation-item").filter({ hasText: title });
  await openDanger(page, item, "Delete permanently…", "E2E permanent delete", "DELETE");
  await item.getByRole("button", { name: "Delete listing" }).click();
  await expect(page.getByRole("status")).toContainText("audit log");

  const { data: gone } = await db.from("listings").select("id").eq("id", listing.id);
  expect(gone).toHaveLength(0);
  expect(await fileExists(db, listing.path)).toBe(false);
  const { data: audit } = await db.from("admin_audit_logs").select("action, details").eq("target_id", listing.id);
  expect(audit?.[0]?.action).toBe("listing.deleted");
});

test("shop suspend hides listings and blocks publishing, reinstate restores, delete removes listings and photos", async ({ page }) => {
  const db = await serviceClient();
  const tag = uid();
  const seller = await makeSeller(db, tag);
  const listing = await makeListing(db, seller.id, `Mgmt shop listing ${tag}`);
  expect(await publicCanSee(listing.id)).toBe(true);

  await signIn(page, "admin@naira.test");
  await page.goto(`/admin/shops?q=${encodeURIComponent(`Mgmt Shop ${tag}`)}`);
  await hydrated(page);
  const row = () => page.getByTestId("shop-row").filter({ hasText: `Mgmt Shop ${tag}` });
  await row().getByLabel("Reason", { exact: true }).fill("E2E shop suspension");
  await row().getByRole("button", { name: "Suspend shop" }).click();
  await expect(page.getByRole("status")).toContainText("audit log");
  await expect(row()).toContainText("suspended");
  expect(await publicCanSee(listing.id)).toBe(false);
  const { data: shopPublic } = await anon().from("seller_profiles").select("user_id").eq("user_id", seller.id);
  expect(shopPublic).toHaveLength(0);

  // The owner cannot publish while the shop is suspended.
  const owner = anon();
  await owner.auth.signInWithPassword({ email: seller.email, password: PASSWORD });
  await db.from("listings").update({ status: "paused" }).eq("id", listing.id);
  const republish = await owner.from("listings").update({ status: "active" }).eq("id", listing.id);
  expect(republish.error?.message).toMatch(/shop is not active/);
  await db.from("listings").update({ status: "active" }).eq("id", listing.id);

  await row().getByRole("button", { name: "Reinstate shop" }).click();
  await expect(row()).toContainText("active");
  expect(await publicCanSee(listing.id)).toBe(true);

  await openDanger(page, row(), "Delete permanently…", "E2E shop deletion", "DELETE");
  await row().getByRole("button", { name: "Delete shop" }).click();
  await expect(page.getByRole("status")).toContainText("audit log");
  const { data: shop } = await db.from("seller_profiles").select("shop_status, shop_name").eq("user_id", seller.id).single();
  expect(shop).toEqual({ shop_status: "deleted", shop_name: "Closed shop" });
  const { data: left } = await db.from("listings").select("id").eq("seller_id", seller.id);
  expect(left).toHaveLength(0);
  expect(await fileExists(db, listing.path)).toBe(false);
  const { data: profile } = await db.from("profiles").select("status").eq("id", seller.id).single();
  expect(profile?.status).toBe("active"); // the member account itself is kept
});

test("close blocks sign-in and reopen restores it; permanent delete revokes the login and anonymises the member", async ({ page, browser }) => {
  const db = await serviceClient();
  const tag = uid();
  const seller = await makeSeller(db, tag);
  const listing = await makeListing(db, seller.id, `Mgmt account listing ${tag}`);

  await signIn(page, "admin@naira.test");
  const usersPage = `/admin/users?q=${encodeURIComponent(seller.email)}`;
  await page.goto(usersPage);
  await hydrated(page);
  const row = () => page.getByTestId("user-row").filter({ hasText: seller.email });

  await row().getByText("Close account…").click();
  await row().getByLabel("Reason for closing").fill("E2E close");
  await row().getByLabel("Type CLOSE to confirm").fill("CLOSE");
  await row().getByRole("button", { name: "Close account" }).click();
  await expect(page.getByRole("status")).toContainText("audit log");
  await expect(row()).toContainText("closed");
  expect(await publicCanSee(listing.id)).toBe(false);

  const member = await browser.newPage();
  await member.goto("/auth/login");
  await member.getByLabel("Email").fill(seller.email);
  await member.getByLabel("Password").fill(PASSWORD);
  await member.getByRole("button", { name: "Sign in" }).click();
  await expect(member.getByText("This account has been closed")).toBeVisible();

  await row().getByRole("button", { name: "Reopen account" }).click();
  await expect(row()).toContainText("active");
  const reopened = await anon().auth.signInWithPassword({ email: seller.email, password: PASSWORD });
  expect(reopened.error).toBeNull();
  expect(await publicCanSee(listing.id)).toBe(true);

  await openDanger(page, row(), "Delete permanently…", "E2E account deletion", "DELETE");
  await row().getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("status")).toContainText("audit log");

  const { data: profile } = await db.from("profiles").select("status, display_name").eq("id", seller.id).single();
  expect(profile).toEqual({ status: "deleted", display_name: "Deleted member" });
  const { data: left } = await db.from("listings").select("id").eq("seller_id", seller.id);
  expect(left).toHaveLength(0);
  expect(await fileExists(db, listing.path)).toBe(false);
  const signInAgain = await anon().auth.signInWithPassword({ email: seller.email, password: PASSWORD });
  expect(signInAgain.error).not.toBeNull();
  const { data: audit } = await db.from("admin_audit_logs").select("action").eq("target_id", seller.id).order("id");
  expect((audit ?? []).map((a) => a.action)).toEqual(expect.arrayContaining(["user.closed", "user.reopened", "user.deleted"]));
});

test("an administrator cannot close or delete their own account, and non-administrators are refused", async ({ page }) => {
  const db = await serviceClient();
  await signIn(page, "admin@naira.test");
  await page.goto("/admin/users?q=admin%40naira.test");
  const self = page.getByTestId("user-row").filter({ hasText: "admin@naira.test" });
  await expect(self).toBeVisible();
  await expect(self.getByText("Delete permanently…")).toHaveCount(0);
  await expect(self.getByText("Close account…")).toHaveCount(0);

  const admin = anon();
  const { data: s } = await admin.auth.signInWithPassword({ email: "admin@naira.test", password: "Password123!" });
  const own = await admin.rpc("admin_delete_account", { p_user: s.user!.id, p_reason: "test" });
  expect(own.error?.message).toMatch(/own account/);
  const ownClose = await admin.rpc("admin_set_account_closed", { p_user: s.user!.id, p_close: true, p_reason: "test" });
  expect(ownClose.error?.message).toMatch(/own account/);

  // A member without the admin role is refused by the database itself.
  const tag = uid();
  const target = await makeSeller(db, tag);
  const buyer = anon();
  await buyer.auth.signInWithPassword({ email: "buyer@naira.test", password: "Password123!" });
  const refused = await buyer.rpc("admin_delete_account", { p_user: target.id, p_reason: "test" });
  expect(refused.error?.message).toMatch(/Administrator access required/);
  const { data: still } = await db.from("profiles").select("status").eq("id", target.id).single();
  expect(still?.status).toBe("active");
});
