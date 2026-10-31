// Shared helpers for the demo-site scripts. Pure functions here are unit-tested in tests/unit/demo-scripts.test.ts.
import { randomBytes } from "node:crypto";

/** The password published in supabase/seed.sql. Used only to prove it no longer works after hardening. */
export const PUBLIC_SEED_PASSWORD = "Password123!";
export const SEED_EMAIL_DOMAIN = "@naira.test";

/** Fields copied from a local listing. Everything else (ids, counters, moderation, timestamps) is set fresh by the demo. */
export const LISTING_FIELDS = [
  "country_code", "city", "latitude", "longitude", "title", "description", "price_minor", "currency", "price_type",
  "condition", "quantity", "delivery_options", "delivery_notes", "attributes",
];
/** Storefront fields copied. Contact details (email, phone, WhatsApp) and image URLs are deliberately left behind. */
export const SELLER_FIELDS = ["shop_name", "slug", "seller_type", "description", "country_code", "city", "business_hours", "delivery_options", "delivery_notes"];

/**
 * Classifies a sign-in attempt made with the public seed password.
 * "rejected" only when Supabase says the credentials are wrong; a rate limit, network error or anything else is
 * "unknown", so a temporary failure is never mistaken for proof that the password is dead.
 */
export function classifySignInProbe({ data, error }) {
  if (data?.session) return "accepted";
  if (!error) return "unknown";
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message ?? "")) return "rejected";
  return "unknown";
}

export function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}

export function isLocalUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/** "https://abcd1234.supabase.co" -> "abcd1234"; null for anything that is not a hosted Supabase project URL. */
export function projectRefFromUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    const m = /^([a-z0-9]{15,30})\.supabase\.co$/.exec(hostname);
    return protocol === "https:" && m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Parses "--flag value" pairs; repeated flags collect into arrays. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    if (out[key] === undefined) out[key] = val;
    else out[key] = [].concat(out[key], val);
  }
  return out;
}

/**
 * Checks that the target is the DEMO cloud project before any write:
 * the URL must be a hosted project whose reference matches the one typed on the command line,
 * and the project must already contain seeded demo profiles (production never has any, because
 * the database refuses is_seed=true from ordinary users and production is never seeded).
 */
export function checkDemoTarget({ url, confirmRef, seedProfileCount }) {
  const ref = projectRefFromUrl(url);
  if (!ref) return { ok: false, reason: "SUPABASE_URL must be a hosted project URL like https://<ref>.supabase.co" };
  if (!confirmRef || confirmRef !== ref) {
    return { ok: false, reason: `--project-ref must be given and must match the URL's project (${ref}). Re-type the DEMO project's reference.` };
  }
  if (!(seedProfileCount > 0)) {
    return { ok: false, reason: "This project has no seeded demo profiles. It does not look like the demo project, so nothing was changed." };
  }
  return { ok: true, ref };
}

export function randomPassword() {
  return randomBytes(32).toString("base64url");
}

export function demoSellerEmail() {
  return `demo-seller-${randomBytes(4).toString("hex")}${SEED_EMAIL_DOMAIN}`;
}

/** A seed account is one with a @naira.test address whose profile is marked as seed data. Both must hold. */
export function isSeedAccount(user, seedProfileIds) {
  return typeof user?.email === "string" && user.email.toLowerCase().endsWith(SEED_EMAIL_DOMAIN) && seedProfileIds.has(user.id);
}

/** Builds the demo listing row from an exported listing and the demo project's reference-data ids. */
export function buildListingRow(exported, { sellerId, regionId, areaId, categoryId, subcategoryId }) {
  if (!categoryId) throw new Error(`Category "${exported.category_slug}" does not exist in the demo project`);
  return {
    ...pick(exported.listing, LISTING_FIELDS),
    attributes: { ...(exported.listing.attributes ?? {}), demo_source_id: exported.source_id },
    seller_id: sellerId,
    region_id: regionId ?? null,
    area_id: areaId ?? null,
    category_id: categoryId,
    subcategory_id: subcategoryId ?? null,
    status: "active",
    is_seed: true,
  };
}

/** Photo file name kept from the original path; it is re-uploaded under the new owner's folder. */
export function demoImagePath(sellerId, originalPath) {
  const file = originalPath.split("/").pop();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(file ?? "") || /^\.+$/.test(file)) throw new Error(`Unexpected image file name: ${originalPath}`);
  return `${sellerId}/${file}`;
}
