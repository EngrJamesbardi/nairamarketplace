#!/usr/bin/env node
// Loads listings exported by export-local.mjs into the DEMO cloud project. Never run it against production:
// it refuses unless --project-ref matches the URL and the project already holds seeded demo data.
//
//   SUPABASE_URL=https://<demo-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<demo secret key> \
//     node scripts/demo/import-demo.mjs --project-ref <demo-ref> --in ./demo-export
//
// Each listing gets a new demo-only owner account (random password, never printed), a storefront and its photos.
// Listings are marked as demo data. Running it twice skips listings already imported.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildListingRow, checkDemoTarget, demoImagePath, demoSellerEmail, parseArgs, pick, randomPassword, SELLER_FIELDS } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inDir = typeof args.in === "string" ? args.in : null;
if (!key || !inDir) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/demo/import-demo.mjs --project-ref <demo-ref> --in <dir>");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

const { count: seedProfileCount } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_seed", true);
const target = checkDemoTarget({ url, confirmRef: args["project-ref"], seedProfileCount });
if (!target.ok) {
  console.error(`Refusing: ${target.reason}`);
  process.exit(1);
}

const { listings } = JSON.parse(await readFile(path.join(inDir, "manifest.json"), "utf8"));
const regionId = async (country, name) =>
  name ? (must(await db.from("regions").select("id").eq("country_code", country).eq("name", name).maybeSingle(), "find region")?.id ?? null) : null;
const areaId = async (region, name) => (region && name ? (must(await db.from("areas").select("id").eq("region_id", region).eq("name", name).maybeSingle(), "find LGA")?.id ?? null) : null);
const categoryId = async (slug) => (slug ? (must(await db.from("categories").select("id").eq("slug", slug).maybeSingle(), "find category")?.id ?? null) : null);

for (const item of listings) {
  const existing = must(await db.from("listings").select("id").eq("attributes->>demo_source_id", item.source_id), "check existing");
  if (existing.length) {
    console.log(`Skipping "${item.listing.title}": already imported.`);
    continue;
  }

  // 1. A demo-only owner account. Nobody is told the password; it exists only so the listing has a seller.
  const created = await db.auth.admin.createUser({
    email: demoSellerEmail(),
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { display_name: item.profile.display_name, country_code: item.profile.country_code },
  });
  if (created.error) throw new Error(`create owner: ${created.error.message}`);
  const sellerId = created.data.user.id;

  // 2. Profile and storefront, marked as demo data.
  const profileRegion = await regionId(item.profile.country_code, item.profile.region_name);
  must(await db.from("profiles").update({ city: item.profile.city, region_id: profileRegion, is_seed: true }).eq("id", sellerId), "update profile");
  let slug = item.seller.slug;
  if (must(await db.from("seller_profiles").select("user_id").eq("slug", slug), "check slug").length) slug = `${slug}-demo`.slice(0, 60);
  must(
    await db.from("seller_profiles").insert({
      ...pick(item.seller, SELLER_FIELDS),
      slug,
      user_id: sellerId,
      region_id: await regionId(item.seller.country_code, item.seller_region_name),
      show_whatsapp: false,
      is_seed: true,
    }),
    "create storefront",
  );

  // 3. The listing.
  const lRegion = await regionId(item.listing.country_code, item.region_name);
  const row = buildListingRow(item, {
    sellerId,
    regionId: lRegion,
    areaId: await areaId(lRegion, item.area_name),
    categoryId: await categoryId(item.category_slug),
    subcategoryId: await categoryId(item.subcategory_slug),
  });
  const listing = must(await db.from("listings").insert(row).select("id").single(), "create listing");

  // 4. Photos, re-uploaded under the new owner's folder with demo-project addresses.
  for (const p of item.photos) {
    const storagePath = demoImagePath(sellerId, p.original_path);
    const bytes = await readFile(path.join(inDir, "photos", p.file));
    must(await db.storage.from("listing-images").upload(storagePath, bytes, { contentType: p.content_type, upsert: false }), `upload ${p.file}`);
    const publicUrl = db.storage.from("listing-images").getPublicUrl(storagePath).data.publicUrl;
    must(
      await db.from("listing_images").insert({ listing_id: listing.id, storage_path: storagePath, url: publicUrl, position: p.position, alt_text: p.alt_text, width: p.width, height: p.height }),
      "save photo",
    );
  }
  console.log(`Imported "${item.listing.title}" (${item.photos.length} photo(s)) into demo project ${target.ref}.`);
}
