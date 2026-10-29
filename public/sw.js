/*
 * Naira Marketplace service worker.
 * - App shell + static assets: cache-first (versioned).
 * - Public pages (home, search, listings, storefronts): network-first, falling back to a cached copy
 *   that the page marks as "possibly out of date".
 * - Private/authenticated routes, API calls, Supabase traffic and non-GET requests: never cached.
 * - Navigation failures with no cached copy: static /offline.html page.
 */
const VERSION = "v2";
const SHELL_CACHE = `nm-shell-${VERSION}`;
const PAGE_CACHE = `nm-pages-${VERSION}`;
const IMAGE_CACHE = `nm-images-${VERSION}`;
// Static, script-free fallback: a framework page would try to load code that is not available offline.
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/brand/mark.svg", "/manifest.webmanifest"];

// Pages that may contain personal or financial data are never stored.
const PRIVATE_PREFIXES = ["/account", "/dashboard", "/messages", "/admin", "/favourites", "/following", "/notifications", "/onboarding", "/auth", "/api", "/pay"];
const PUBLIC_PAGE = /^\/($|search|listing\/|s\/|category\/|legal\/|install|sell$)/;
const MAX_PAGES = 40;
const MAX_IMAGES = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE)));
  // Do not skipWaiting automatically: the page asks the user before activating an update.
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "CLEAR_PRIVATE") {
    // Called on sign-out: drop cached pages in case any personalised HTML slipped in.
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, PAGE_CACHE, IMAGE_CACHE];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function isPrivate(url) {
  return PRIVATE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/") || url.pathname.startsWith(p + "?"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Same-origin only for pages/static; cross-origin public images (Supabase Storage) may be cached.
  if (url.origin !== self.location.origin) {
    if (req.destination === "image" && url.pathname.includes("/storage/v1/object/public/")) {
      event.respondWith(staleWhileRevalidate(req, IMAGE_CACHE, MAX_IMAGES));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
  if (req.destination === "image" && url.pathname.startsWith("/seed/")) {
    event.respondWith(staleWhileRevalidate(req, IMAGE_CACHE, MAX_IMAGES));
    return;
  }

  if (req.mode === "navigate") {
    if (isPrivate(url)) {
      event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
      return;
    }
    event.respondWith(networkFirstPage(req, url));
  }
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") {
        cache.put(req, res.clone()).then(() => trim(cacheName, max));
      }
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirstPage(req, url) {
  try {
    const res = await fetch(req);
    // Only public marketplace pages are stored, and never anything the server flags as private.
    // (Next.js marks dynamic HTML "no-store" for HTTP caches; this device-local cache is cleared on sign-out.)
    if (res.ok && PUBLIC_PAGE.test(url.pathname) && !res.headers.get("x-nm-private")) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(req, res.clone());
      trim(PAGE_CACHE, MAX_PAGES);
    }
    return res;
  } catch {
    const cached = await caches.match(req, { ignoreSearch: false });
    if (cached) {
      // Tell the page it is viewing a cached copy.
      const body = await cached.text();
      return new Response(
        body.replace("<body", '<body data-offline-cache="true"'),
        { headers: { "Content-Type": "text/html; charset=utf-8", "X-NM-From-Cache": "1" } },
      );
    }
    return (await caches.match(OFFLINE_URL)) || new Response("Offline", { status: 503 });
  }
}
