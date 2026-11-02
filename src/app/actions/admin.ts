import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { parseToMinor } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Single entry point for admin forms (posted natively to /admin/op, see route.ts). Authorisation happens twice: requireAdmin() here, and the
 * SECURITY DEFINER database functions re-check is_admin()/is_staff() and write the audit log.
 */
const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const reason = z.string().trim().min(3, "Enter a reason (at least 3 characters)").max(300);
/** Destructive operations must be confirmed by typing a word, checked here as well as in the browser. */
const typed = (word: string) => z.string().trim().refine((v) => v === word, `Type ${word} to confirm`);
/** Closed logins are banned for 100 years; reopening lifts the ban. */
const BAN_FOR = "876000h";

const ops = {
  "listing.moderate": z.object({ id: uuid, action: z.enum(["approve", "reject", "remove", "restore"]), reason: text(300), report: uuid.optional().or(z.literal("").transform(() => undefined)) }),
  "user.status": z.object({ id: uuid, status: z.enum(["active", "suspended"]), reason: text(300), days: z.coerce.number().int().min(0).max(3650).optional() }),
  "user.role": z.object({ id: uuid, role: z.enum(["admin", "moderator"]), grant: z.enum(["1", "0"]) }),
  "report.resolve": z.object({ id: uuid, status: z.enum(["reviewing", "resolved", "dismissed"]), note: text(500) }),
  "review.status": z.object({ id: uuid, status: z.enum(["published", "hidden"]), reason: text(300) }),
  "verification.review": z.object({ id: uuid, approve: z.enum(["1", "0"]), note: text(300) }),
  "seller.feature": z.object({ id: uuid, featured: z.enum(["1", "0"]) }),
  "user.close": z.object({ id: uuid, reason, confirm: typed("CLOSE") }),
  "user.reopen": z.object({ id: uuid }),
  "user.delete": z.object({ id: uuid, reason, confirm: typed("DELETE") }),
  "shop.status": z.object({ id: uuid, status: z.enum(["active", "suspended", "closed"]), reason: text(300) }),
  "shop.delete": z.object({ id: uuid, reason, confirm: typed("DELETE") }),
  "listing.delete": z.object({ id: uuid, reason, confirm: typed("DELETE") }),
  "country.update": z.object({
    code: z.string().regex(/^[A-Z]{2}$/),
    is_active: z.enum(["on"]).optional(),
    allow_cross_border_discovery: z.enum(["on"]).optional(),
    free_active_listing_limit: z.coerce.number().int().min(0).max(100000),
    listing_duration_days: z.coerce.number().int().min(1).max(365),
    payment_provider: z.string().max(30).optional(),
  }),
  "category.upsert": z.object({
    id: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
    parent: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().trim().min(2).max(60),
    icon: text(40),
    sort: z.coerce.number().int().min(0).max(1000).default(0),
    active: z.enum(["on"]).optional(),
  }),
  "term.set": z.object({ country: z.string().regex(/^[A-Z]{2}$/).optional().or(z.literal("").transform(() => undefined)), term: z.string().trim().min(2).max(80), action: z.enum(["review", "block"]), reason: text(200) }),
  "term.delete": z.object({ country: z.string().regex(/^[A-Z]{2}$/).optional().or(z.literal("").transform(() => undefined)), term: z.string().trim().min(2).max(80) }),
  "policy.set": z.object({ country: z.string().regex(/^[A-Z]{2}$/).optional().or(z.literal("").transform(() => undefined)), kind: z.enum(["prohibited_items", "safety", "terms_addendum", "privacy_addendum"]), title: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(10000) }),
  "package.upsert": z.object({
    id: uuid.optional().or(z.literal("").transform(() => undefined)),
    country: z.string().regex(/^[A-Z]{2}$/),
    name: z.string().trim().min(2).max(60),
    credits: z.coerce.number().int().min(1).max(100000),
    price: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a price like 2500 or 2500.00"),
    active: z.enum(["on"]).optional(),
    sort: z.coerce.number().int().min(0).max(1000).default(0),
  }),
  "plan.upsert": z.object({
    id: uuid.optional().or(z.literal("").transform(() => undefined)),
    country: z.string().regex(/^[A-Z]{2}$/),
    code: z.string().trim().regex(/^[a-z0-9-]{2,40}$/),
    name: z.string().trim().min(2).max(60),
    description: text(500),
    price: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a price like 3000 or 3000.00"),
    period_days: z.coerce.number().int().min(1).max(366),
    listing_limit: z.coerce.number().int().min(1).max(100000),
    monthly_credits: z.coerce.number().int().min(0).max(100000),
    active: z.enum(["on"]).optional(),
    sort: z.coerce.number().int().min(0).max(1000).default(0),
  }),
  "promo_package.upsert": z.object({
    id: uuid.optional().or(z.literal("").transform(() => undefined)),
    country: z.string().regex(/^[A-Z]{2}$/),
    code: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "Code: 2-40 lowercase letters, numbers or hyphens"),
    name: z.string().trim().min(2).max(60),
    description: text(300),
    days: z.coerce.number().int().min(1, "Duration must be 1-90 days").max(90, "Duration must be 1-90 days"),
    price: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a price like 2000 or 2000.00"),
    placements: z.array(z.enum(["search", "homepage", "category"])).min(1, "Choose at least one placement"),
    active: z.enum(["on"]).optional(),
    sort: z.coerce.number().int().min(0).max(1000).default(0),
  }),
  "category.min_images": z.object({ id: z.coerce.number().int().positive(), min_images: z.coerce.number().int().min(1).max(10) }),
  "promo_price.set": z.object({ country: z.string().regex(/^[A-Z]{2}$/), placement: z.enum(["search", "homepage", "category"]), credits_per_day: z.coerce.number().int().min(1).max(10000) }),
  "credits.adjust": z.object({ id: uuid, delta: z.coerce.number().int().min(-100000).max(100000).refine((n) => n !== 0, "Enter a non-zero amount"), reason: z.string().trim().min(3).max(300), request_id: uuid }),
  "campaign.status": z.object({ id: uuid, status: z.enum(["paused", "active", "removed"]), note: text(300) }),
  "setting.set": z.object({ key: z.enum(["tagline", "positioning", "max_sponsored_per_page"]), value: z.string().trim().min(1).max(300) }),
} as const;

type Op = keyof typeof ops;

/** Runs one admin operation and returns the URL to send the browser back to (with ?ok=1 or ?error=). */
export async function runAdminOp(formData: FormData): Promise<string> {
  const { supabase, user: me } = await requireAdmin();
  const op = String(formData.get("op")) as Op;
  const back = String(formData.get("back") ?? "/admin");
  const safeBack = back.startsWith("/admin") ? back : "/admin";
  const schema = ops[op];
  const sep = safeBack.includes("?") ? "&" : "?";
  if (!schema) return `${safeBack}${sep}error=${encodeURIComponent("Unknown operation")}`;
  const parsed = schema.safeParse({ ...Object.fromEntries(formData), placements: formData.getAll("placements") });
  if (!parsed.success) return `${safeBack}${sep}error=${encodeURIComponent(parsed.error.issues[0].message)}`;
  const v = parsed.data as unknown as Record<string, never>;

  let res: { error: { message: string; code?: string } | null };
  switch (op) {
    case "listing.moderate":
      res = await supabase.rpc("moderate_listing", { p_listing: v.id, p_action: v.action, p_reason: v.reason ?? undefined, p_report: v.report ?? undefined });
      break;
    case "user.status": {
      const until = v.days ? new Date(Date.now() + Number(v.days) * 86400000).toISOString() : undefined;
      res = await supabase.rpc("admin_set_user_status", { p_user: v.id, p_status: v.status, p_reason: v.reason ?? undefined, p_until: until });
      break;
    }
    case "user.role":
      res = await supabase.rpc("admin_set_role", { p_user: v.id, p_role: v.role, p_grant: v.grant === "1" });
      break;
    case "report.resolve":
      res = await supabase.rpc("resolve_report", { p_report: v.id, p_status: v.status, p_note: v.note ?? "" });
      break;
    case "review.status":
      res = await supabase.rpc("admin_set_review_status", { p_review: v.id, p_status: v.status, p_reason: v.reason ?? "" });
      break;
    case "verification.review":
      res = await supabase.rpc("admin_review_verification", { p_id: v.id, p_approve: v.approve === "1", p_note: v.note ?? "" });
      break;
    case "seller.feature":
      res = await supabase.rpc("admin_feature_seller", { p_seller: v.id, p_featured: v.featured === "1" });
      break;
    case "user.close": {
      // Ban the login first, so a failure leaves nothing half-done; undo the ban if the database refuses (e.g. last admin).
      const admin = createAdminClient();
      const { data: target } = await admin.from("profiles").select("status").eq("id", v.id).maybeSingle();
      if (v.id === me.id) {
        res = { error: { message: "You cannot close your own account." } };
        break;
      }
      if (!target || target.status === "closed" || target.status === "deleted") {
        res = { error: { message: target ? `This account is already ${target.status}.` : "User not found" } };
        break;
      }
      const ban = await admin.auth.admin.updateUserById(v.id, { ban_duration: BAN_FOR });
      if (ban.error) {
        res = { error: { message: "Could not block the login. Nothing was changed." } };
        break;
      }
      res = await supabase.rpc("admin_set_account_closed", { p_user: v.id, p_close: true, p_reason: v.reason });
      if (res.error) await admin.auth.admin.updateUserById(v.id, { ban_duration: "none" });
      break;
    }
    case "user.reopen": {
      res = await supabase.rpc("admin_set_account_closed", { p_user: v.id, p_close: false });
      if (!res.error) {
        const unban = await createAdminClient().auth.admin.updateUserById(v.id, { ban_duration: "none" });
        if (unban.error) res = { error: { message: "The account was reopened, but the login is still blocked. Try Reopen again." } };
      }
      break;
    }
    case "user.delete": {
      const del = await supabase.rpc("admin_delete_account", { p_user: v.id, p_reason: v.reason });
      if (del.error) {
        res = del;
        break;
      }
      const admin = createAdminClient();
      const leftover = await removeStoredFiles(admin, del.data ?? [], v.id);
      // Soft delete: the login is revoked and the email freed, while the anonymised profile keeps message, review and
      // payment history intact. Re-running Delete on the same account retries this step.
      const auth = await admin.auth.admin.deleteUser(v.id, true);
      res = auth.error
        ? { error: { message: "Personal data was removed, but the login could not be revoked. Run Delete again to retry." } }
        : leftover
          ? { error: { message: `Account deleted, but ${leftover} stored file(s) could not be removed. They are no longer linked to anything.` } }
          : { error: null };
      break;
    }
    case "shop.status":
      res = await supabase.rpc("admin_set_shop_status", { p_seller: v.id, p_status: v.status, p_reason: v.reason ?? undefined });
      break;
    case "shop.delete":
    case "listing.delete": {
      // Shop logo and banner live in the avatars bucket; note their paths before the shop details are cleared.
      const shopFiles: string[] = [];
      if (op === "shop.delete") {
        const { data: shop } = await supabase.from("seller_profiles").select("logo_url, banner_url").eq("user_id", v.id).maybeSingle();
        for (const u of [shop?.logo_url, shop?.banner_url]) {
          const path = u?.split("/storage/v1/object/public/avatars/")[1];
          if (path) shopFiles.push(decodeURIComponent(path.split("?")[0]));
        }
      }
      const del = op === "shop.delete"
        ? await supabase.rpc("admin_delete_shop", { p_seller: v.id, p_reason: v.reason })
        : await supabase.rpc("admin_delete_listing", { p_listing: v.id, p_reason: v.reason });
      if (del.error) {
        res = del;
        break;
      }
      const admin = createAdminClient();
      let leftover = await removeStoredFiles(admin, del.data ?? []);
      if (shopFiles.length && (await admin.storage.from("avatars").remove(shopFiles)).error) leftover += shopFiles.length;
      res = leftover
        ? { error: { message: `Deleted, but ${leftover} photo(s) could not be removed from storage. They are no longer linked to anything.` } }
        : { error: null };
      break;
    }
    case "country.update":
      res = await supabase.rpc("admin_update_country", {
        p_code: v.code,
        p_patch: {
          is_active: v.is_active === "on",
          allow_cross_border_discovery: v.allow_cross_border_discovery === "on",
          free_active_listing_limit: v.free_active_listing_limit,
          listing_duration_days: v.listing_duration_days,
          payment_provider: v.payment_provider ?? "",
        },
      });
      break;
    case "category.upsert":
      res = await supabase.rpc("admin_upsert_category", {
        p_id: (v.id ?? undefined) as unknown as number,
        p_parent: (v.parent ?? undefined) as unknown as number,
        p_slug: v.slug, p_name: v.name, p_icon: v.icon ?? "", p_sort: v.sort, p_active: v.active === "on",
      });
      break;
    case "term.set":
      res = await supabase.rpc("admin_set_prohibited_term", { p_country: (v.country ?? undefined) as unknown as string, p_term: v.term, p_action: v.action, p_reason: v.reason ?? "" });
      break;
    case "term.delete":
      res = await supabase.rpc("admin_set_prohibited_term", { p_country: (v.country ?? undefined) as unknown as string, p_term: v.term, p_action: "review", p_reason: "", p_delete: true });
      break;
    case "policy.set":
      res = await supabase.rpc("admin_set_policy", { p_country: (v.country ?? undefined) as unknown as string, p_kind: v.kind, p_title: v.title, p_body: v.body });
      break;
    case "package.upsert": {
      const { data: c } = await supabase.from("countries").select("currency_code").eq("code", v.country).single();
      res = await supabase.rpc("admin_upsert_package", {
        p_id: (v.id ?? undefined) as unknown as string, p_country: v.country, p_name: v.name, p_credits: v.credits,
        p_price_minor: Number(parseToMinor(v.price, c?.currency_code ?? "NGN")), p_active: v.active === "on", p_sort: v.sort,
      });
      break;
    }
    case "plan.upsert": {
      const { data: c } = await supabase.from("countries").select("currency_code").eq("code", v.country).single();
      res = await supabase.rpc("admin_upsert_plan", {
        p_id: (v.id ?? undefined) as unknown as string, p_country: v.country, p_code: v.code, p_name: v.name, p_description: v.description ?? "",
        p_price_minor: Number(parseToMinor(v.price, c?.currency_code ?? "NGN")), p_period_days: v.period_days, p_listing_limit: v.listing_limit,
        p_monthly_credits: v.monthly_credits, p_active: v.active === "on", p_sort: v.sort,
      });
      break;
    }
    case "promo_package.upsert": {
      const { data: c } = await supabase.from("countries").select("currency_code").eq("code", v.country).single();
      if (!c) {
        res = { error: { message: "Unknown market" } };
        break;
      }
      res = await supabase.rpc("admin_upsert_promotion_package", {
        p_id: (v.id ?? undefined) as unknown as string, p_country: v.country, p_code: v.code, p_name: v.name, p_description: v.description ?? "",
        p_days: v.days, p_price_minor: Number(parseToMinor(v.price, c.currency_code)), p_placements: v.placements, p_active: v.active === "on", p_sort: v.sort,
      });
      break;
    }
    case "category.min_images":
      res = await supabase.rpc("admin_set_category_min_images", { p_id: v.id, p_min: v.min_images });
      break;
    case "promo_price.set":
      res = await supabase.rpc("admin_set_promotion_price", { p_country: v.country, p_placement: v.placement, p_credits_per_day: v.credits_per_day });
      break;
    case "credits.adjust":
      res = await supabase.rpc("admin_adjust_credits", { p_user: v.id, p_delta: v.delta, p_reason: v.reason, p_request_id: v.request_id });
      break;
    case "campaign.status":
      res = await supabase.rpc("admin_set_campaign_status", { p_id: v.id, p_status: v.status, p_note: v.note ?? "" });
      break;
    case "setting.set": {
      const value = v.key === "max_sponsored_per_page" ? Number(v.value) : v.value;
      res = await supabase.rpc("admin_set_setting", { p_key: v.key, p_value: value });
      break;
    }
    default:
      res = { error: { message: "Unknown operation" } };
  }
  revalidatePath("/", "layout");
  return res.error ? `${safeBack}${sep}error=${encodeURIComponent(friendlyError(res.error, res.error.message))}` : `${safeBack}${sep}ok=1`;
}

/**
 * Removes listing photos (paths returned by the admin_delete_* functions) and, for a deleted account, the member's avatar
 * folder. Returns how many files could not be removed. The database rows are already gone, so a failure only leaves
 * unlinked files behind.
 */
async function removeStoredFiles(admin: ReturnType<typeof createAdminClient>, listingPaths: string[], avatarOwner?: string): Promise<number> {
  let failed = 0;
  for (let i = 0; i < listingPaths.length; i += 100) {
    const batch = listingPaths.slice(i, i + 100);
    const { error } = await admin.storage.from("listing-images").remove(batch);
    if (error) failed += batch.length;
  }
  if (avatarOwner) {
    const { data: files, error } = await admin.storage.from("avatars").list(avatarOwner, { limit: 1000 });
    if (error) failed += 1;
    else if (files?.length) {
      const { error: rmErr } = await admin.storage.from("avatars").remove(files.map((f) => `${avatarOwner}/${f.name}`));
      if (rmErr) failed += files.length;
    }
  }
  return failed;
}
