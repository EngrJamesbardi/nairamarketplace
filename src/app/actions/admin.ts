import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";

/**
 * Single entry point for admin forms (posted natively to /admin/op, see route.ts). Authorisation happens twice: requireAdmin() here, and the
 * SECURITY DEFINER database functions re-check is_admin()/is_staff() and write the audit log.
 */
const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const ops = {
  "listing.moderate": z.object({ id: uuid, action: z.enum(["approve", "reject", "remove", "restore"]), reason: text(300), report: uuid.optional().or(z.literal("").transform(() => undefined)) }),
  "user.status": z.object({ id: uuid, status: z.enum(["active", "suspended"]), reason: text(300), days: z.coerce.number().int().min(0).max(3650).optional() }),
  "user.role": z.object({ id: uuid, role: z.enum(["admin", "moderator"]), grant: z.enum(["1", "0"]) }),
  "report.resolve": z.object({ id: uuid, status: z.enum(["reviewing", "resolved", "dismissed"]), note: text(500) }),
  "review.status": z.object({ id: uuid, status: z.enum(["published", "hidden"]), reason: text(300) }),
  "verification.review": z.object({ id: uuid, approve: z.enum(["1", "0"]), note: text(300) }),
  "seller.feature": z.object({ id: uuid, featured: z.enum(["1", "0"]) }),
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
  "setting.set": z.object({ key: z.enum(["tagline", "positioning", "max_sponsored_per_page"]), value: z.string().trim().min(1).max(300) }),
} as const;

type Op = keyof typeof ops;

/** Runs one admin operation and returns the URL to send the browser back to (with ?ok=1 or ?error=). */
export async function runAdminOp(formData: FormData): Promise<string> {
  const { supabase } = await requireAdmin();
  const op = String(formData.get("op")) as Op;
  const back = String(formData.get("back") ?? "/admin");
  const safeBack = back.startsWith("/admin") ? back : "/admin";
  const schema = ops[op];
  const sep = safeBack.includes("?") ? "&" : "?";
  if (!schema) return `${safeBack}${sep}error=${encodeURIComponent("Unknown operation")}`;
  const parsed = schema.safeParse(Object.fromEntries(formData));
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
