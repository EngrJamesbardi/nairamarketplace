import { readFileSync, rmSync } from "node:fs";
import { serviceClient } from "./helpers";
import { RUN_START_FILE } from "./global-setup";

// Test accounts the specs create (helpers and specs use these address shapes) plus the seeded demo accounts they sign in as.
const TEST_EMAIL = /@example\.test$|^(verify|resend|reset|seller)-[a-z0-9]+@naira\.test$/;
const DEMO_EMAIL = /@naira\.test$/;

/**
 * Deletes the listings this test run created, and the photos uploaded for them, so local data doesn't pile up.
 * Only listings created after the run started, not seed data, and owned by a test or demo account are touched.
 * Deleting a listing cascades to its photos rows, views, favourites, offers and promotions; conversations, reviews,
 * reports and payment records keep their rows with the listing link cleared. Accounts are left alone.
 * Runs only against a local Supabase. Set E2E_KEEP_DATA=1 to keep everything for debugging.
 */
export default async function globalTeardown() {
  let since: string;
  try {
    since = readFileSync(RUN_START_FILE, "utf8").trim();
  } catch {
    return;
  }
  rmSync(RUN_START_FILE, { force: true });
  if (process.env.E2E_KEEP_DATA === "1") return;

  const supabaseUrl = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim() ?? "";
  const host = supabaseUrl ? new URL(supabaseUrl).hostname : "";
  if (!["127.0.0.1", "localhost"].includes(host)) {
    console.warn(`[e2e cleanup] skipped: "${host}" is not a local Supabase`);
    return;
  }
  const db = await serviceClient();

  const sellers: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email && (TEST_EMAIL.test(u.email) || DEMO_EMAIL.test(u.email))) sellers.push(u.id);
    if (data.users.length < 1000) break;
  }

  const ids: string[] = [];
  for (let i = 0; i < sellers.length; i += 100) {
    const { data, error } = await db.from("listings").select("id").in("seller_id", sellers.slice(i, i + 100)).eq("is_seed", false).gte("created_at", since);
    if (error) throw error;
    ids.push(...(data ?? []).map((l) => l.id));
  }
  if (!ids.length) return;

  let files = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data: images } = await db.from("listing_images").select("storage_path").in("listing_id", batch);
    // Seeded photos live in /public (storage_path "seed/..."), not in Storage.
    const paths = (images ?? []).map((img) => img.storage_path).filter((p) => !p.startsWith("seed"));
    if (paths.length) {
      const { data: removed } = await db.storage.from("listing-images").remove(paths);
      files += removed?.length ?? 0;
    }
    const { error } = await db.from("listings").delete().in("id", batch);
    if (error) throw error;
  }
  console.log(`[e2e cleanup] deleted ${ids.length} test listings and ${files} uploaded photos`);
}
