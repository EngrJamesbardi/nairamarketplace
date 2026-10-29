// Captures the local demo flows for docs/DEMO.md. Needs the app on :3000 and the seeded local database.
//   node scripts/demo-screenshots.mjs
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";
const b = await chromium.launch();

async function session(email, device = devices["Pixel 7"], extra = {}) {
  const ctx = await b.newContext({ ...device, ...extra });
  const p = await ctx.newPage();
  if (email) {
    await p.goto(`${BASE}/auth/login`);
    await p.getByLabel("Email").fill(email);
    await p.getByLabel("Password").fill("Password123!");
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/auth"));
  }
  return { ctx, p };
}
async function shot(p, path, name, full = false) {
  await p.goto(BASE + path);
  await p.waitForLoadState("load");
  await p.locator("main h1, main h2").first().waitFor({ timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 72, fullPage: full });
  console.log(name);
}

const guest = await session(null);
await shot(guest.p, "/", "01-home-mobile");
await shot(guest.p, "/search?q=phone", "02-search-mobile");
await guest.p.goto(`${BASE}/search`);
const first = await guest.p.getByTestId("product-card").first().getByRole("link").first().getAttribute("href");
await shot(guest.p, first, "03-listing-mobile");
await shot(guest.p, "/s/chiomas-closet", "04-storefront-mobile");
await shot(guest.p, "/pricing", "05-pricing-mobile");
await guest.ctx.close();

const buyer = await session("buyer@naira.test");
await buyer.p.goto(`${BASE}/messages`);
const conv = await buyer.p.locator('a[href^="/messages/"]').first().getAttribute("href").catch(() => null);
if (conv) await shot(buyer.p, conv, "06-conversation-offer-mobile");
await buyer.ctx.close();

const seller = await session("tunde@naira.test");
await shot(seller.p, "/dashboard", "07-seller-dashboard-mobile");
await shot(seller.p, "/dashboard/listings/new", "08-new-listing-mobile");
await shot(seller.p, "/dashboard/credits", "09-credits-mobile");
await shot(seller.p, "/dashboard/promotions", "10-promotions-mobile");
await seller.ctx.close();

const admin = await session("admin@naira.test", devices["Desktop Chrome"], { viewport: { width: 1366, height: 860 } });
await shot(admin.p, "/admin", "11-admin-overview-desktop");
await shot(admin.p, "/admin/payments", "12-admin-payments-desktop");
await shot(admin.p, "/admin/audit", "13-admin-audit-desktop");
await admin.ctx.close();

const desk = await session(null, devices["Desktop Chrome"], { viewport: { width: 1366, height: 860 } });
await shot(desk.p, "/", "14-home-desktop");
await desk.ctx.addCookies([{ name: "nm_theme", value: "dark", url: BASE }]);
await shot(desk.p, "/", "15-home-dark-desktop");
await desk.ctx.close();

const off = await session(null);
await off.p.goto(BASE + "/"); await off.p.evaluate(async () => { await navigator.serviceWorker.ready; }); await off.p.reload();
await off.ctx.setOffline(true);
await shot(off.p, "/", "16-offline-saved-copy-mobile");
await shot(off.p, "/legal/terms?x=1", "17-offline-fallback-mobile");
await off.ctx.close();
await b.close();
