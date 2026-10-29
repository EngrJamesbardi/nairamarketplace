import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { signIn } from "./helpers";

const SW_PATH = "public/sw.js";

test.describe("installable PWA", () => {
  test("manifest has the brand identity, standalone display and installable icons", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m).toMatchObject({ name: "Naira Marketplace", display: "standalone", theme_color: "#B84A24", background_color: "#FFF0E7", start_url: "/?source=pwa" });
    const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.ok(), icon.src).toBeTruthy();
      expect(r.headers()["content-type"]).toContain("image/png");
    }
  });

  test("pages declare the theme colour, manifest and apple touch icon", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", /#B84A24/i);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute("href", /icon/);
  });

  test("service worker installs and controls the page", async ({ page }) => {
    await page.goto("/");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  });

  test("offline: visited public pages show a labelled saved copy, others show the offline page", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); // now controlled; this load is stored in the page cache
    await page.goto("/search?q=demo");
    await context.setOffline(true);

    await page.goto("/");
    await expect(page.getByTestId("offline-banner")).toContainText(/saved copy|offline/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/legal/terms?never-visited=1");
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();

    await page.goto("/account"); // private pages are never served from the cache
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await context.setOffline(false);
  });

  test("private pages are never written to the device cache", async ({ page }) => {
    await signIn(page, "buyer@naira.test");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    for (const p of ["/account", "/messages", "/favourites", "/notifications"]) await page.goto(p);
    await page.goto("/");
    const cached: string[] = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
      return urls;
    });
    expect(cached.filter((u) => /^\/(account|messages|favourites|notifications|dashboard|admin|auth|pay)/.test(u))).toEqual([]);
  });

  test("a new version is only applied when the user chooses to update", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.getByRole("searchbox").first().fill("half-typed search"); // must survive until the user opts in
    // Simulate a new deployment: the server starts serving a changed service worker (restored afterwards).
    // (Playwright cannot intercept the browser's own service-worker update fetch, so the file on disk is changed.)
    const original = readFileSync(SW_PATH, "utf8");
    writeFileSync(SW_PATH, original.replace(/const VERSION = "[^"]+"/, `const VERSION = "e2e-${Date.now()}"`));
    try {
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
    } finally {
      writeFileSync(SW_PATH, original);
    }
    const prompt = page.getByRole("button", { name: "Update now" });
    await expect(prompt).toBeVisible();
    await expect(page.getByRole("searchbox").first()).toHaveValue("half-typed search"); // no surprise reload
    await prompt.click();
    await expect(prompt).toBeHidden();
    await expect(page.getByRole("searchbox").first()).toHaveValue(""); // reloaded onto the new version
  });
});

test("install page explains how to install on Android and iPhone", async ({ page }) => {
  await page.goto("/install");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/iPhone|iOS/).first()).toBeVisible();
  await expect(page.getByText(/Android/).first()).toBeVisible();
});
