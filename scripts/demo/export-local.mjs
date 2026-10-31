#!/usr/bin/env node
// READ-ONLY export of chosen non-seed listings (with their photos) from the LOCAL Supabase database, for the demo site.
// It only selects rows and downloads files. It never writes to the local database or Storage.
//
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_SUPABASE_SERVICE_ROLE_KEY=<local key from `npx supabase status`> \
//     node scripts/demo/export-local.mjs --listing 7c1950f9 --out ./demo-export
//
// --listing takes a full listing id or a unique id prefix and can be repeated. Seed listings are refused: seed.sql
// recreates those. Only the fields the import uses are read: no owner email, password, ids or contact details.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isLocalUrl, LISTING_FIELDS, parseArgs, SELLER_FIELDS } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const url = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const wanted = [].concat(args.listing ?? []).map(String);
const outDir = typeof args.out === "string" ? args.out : null;

if (!isLocalUrl(url)) {
  console.error(`Refusing: ${url} is not a local Supabase address. This script only reads your local database.`);
  process.exit(1);
}
if (!key || !wanted.length || !outDir) {
  console.error("Usage: LOCAL_SUPABASE_SERVICE_ROLE_KEY=... node scripts/demo/export-local.mjs --listing <id-or-prefix> [--listing ...] --out <dir>");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

const all = must(await db.from("listings").select("id, title, is_seed"), "list listings");
const manifest = [];
await mkdir(path.join(outDir, "photos"), { recursive: true });

for (const w of wanted) {
  const matches = all.filter((l) => l.id === w || l.id.startsWith(w));
  if (matches.length !== 1) throw new Error(`--listing ${w} matched ${matches.length} listings; give more of the id`);
  const { id, is_seed } = matches[0];
  if (is_seed) throw new Error(`Listing ${id} is a seed listing. seed.sql recreates it, so it is not exported.`);

  // Only the fields the import uses are read, so no contact details or account data leave the database.
  const listing = must(
    await db.from("listings").select([...LISTING_FIELDS, "seller_id", "region_id", "area_id", "category_id", "subcategory_id"].join(", ")).eq("id", id).single(),
    "read listing",
  );
  const seller = must(await db.from("seller_profiles").select([...SELLER_FIELDS, "region_id"].join(", ")).eq("user_id", listing.seller_id).single(), "read storefront");
  const profile = must(await db.from("profiles").select("display_name, country_code, city, region_id").eq("id", listing.seller_id).single(), "read profile");
  const images = must(await db.from("listing_images").select("storage_path, position, alt_text, width, height").eq("listing_id", id).order("position"), "read photos");
  const nameOf = async (table, rowId) => (rowId ? must(await db.from(table).select("name").eq("id", rowId).single(), `read ${table}`).name : null);
  const slugOf = async (rowId) => (rowId ? must(await db.from("categories").select("slug").eq("id", rowId).single(), "read category").slug : null);

  const photos = [];
  for (const img of images) {
    if (img.storage_path.startsWith("seed/")) continue; // static drawings ship with the app
    const blob = must(await db.storage.from("listing-images").download(img.storage_path), `download ${img.storage_path}`);
    const file = `${id}-${img.position}-${img.storage_path.split("/").pop()}`;
    await writeFile(path.join(outDir, "photos", file), Buffer.from(await blob.arrayBuffer()));
    photos.push({ file, original_path: img.storage_path, position: img.position, alt_text: img.alt_text, width: img.width, height: img.height, content_type: blob.type || "image/webp" });
  }

  // The local owner's id and the storefront's region id are not needed by the import, so they stay out of the file.
  const listingFields = Object.fromEntries(Object.entries(listing).filter(([k]) => k !== "seller_id"));
  const sellerFields = Object.fromEntries(Object.entries(seller).filter(([k]) => k !== "region_id"));
  manifest.push({
    source_id: id,
    listing: listingFields,
    region_name: await nameOf("regions", listing.region_id),
    area_name: await nameOf("areas", listing.area_id),
    category_slug: await slugOf(listing.category_id),
    subcategory_slug: await slugOf(listing.subcategory_id),
    seller: sellerFields,
    seller_region_name: await nameOf("regions", seller.region_id),
    profile: { display_name: profile.display_name, country_code: profile.country_code, city: profile.city, region_name: await nameOf("regions", profile.region_id) },
    photos,
  });
  console.log(`Exported "${listing.title}" with ${photos.length} photo(s).`);
}

await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({ exported_at: new Date().toISOString(), listings: manifest }, null, 2));
console.log(`Wrote ${manifest.length} listing(s) to ${outDir}. Nothing in the local database was changed.`);
