import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { isStaffRole } from "@/lib/roles";

export { isStaffRole };

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/** Current user + profile + roles for this request (cached per request). */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null, roles: [] as string[], seller: null };
  const [{ data: profileRow }, { data: roles }, { data: seller }] = await Promise.all([
    supabase.rpc("get_my_profile"),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("seller_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const profile = (profileRow as unknown as Profile | null)?.id ? (profileRow as unknown as Profile) : null;
  return { supabase, user, profile, roles: (roles ?? []).map((r) => r.role as string), seller };
});

export async function requireUser(next?: string) {
  const s = await getSession();
  if (!s.user) redirect(`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  // Closed accounts are also banned at sign-in; this catches a session that was already open when the account was closed.
  if (s.profile?.status === "suspended" || s.profile?.status === "closed") redirect("/account/suspended");
  return s as typeof s & { user: NonNullable<typeof s.user> };
}

/**
 * Two-step verification state for the current session (cached per request).
 * `level` is the `aal` claim of the session's access token, read with getClaims(), which verifies the token's signature.
 * `factors` come from getUser() (Supabase Auth's own copy), not from the cookie, so a stale cookie cannot hide or invent one.
 */
export const getMfaState = cache(async () => {
  const s = await getSession();
  const factors = (s.user?.factors ?? []).filter((f) => f.factor_type === "totp" && f.status === "verified");
  const { data } = s.user ? await s.supabase.auth.getClaims() : { data: null };
  const level = data?.claims?.aal === "aal2" && data.claims.sub === s.user?.id ? ("aal2" as const) : ("aal1" as const);
  return { level, factors };
});

/**
 * Server-side staff check for every /admin page, the admin layout and runAdminOp (/admin/op).
 * Admins and moderators must have passed two-step verification in this session (aal2): with an authenticator they are sent to
 * the code step, without one to the set-up page. The database independently re-checks via is_admin()/is_staff() in every admin RPC.
 */
export async function requireAdmin(next = "/admin") {
  const s = await requireUser(next);
  if (!isStaffRole(s.roles)) redirect("/");
  const mfa = await getMfaState();
  if (mfa.level !== "aal2") {
    if (mfa.factors.length) redirect(`/auth/mfa?next=${encodeURIComponent(next)}`);
    redirect("/account/security?required=admin");
  }
  return s;
}

export async function requireSeller(next = "/dashboard") {
  const s = await requireUser(next);
  if (!s.seller) redirect(`/onboarding/seller?next=${encodeURIComponent(next)}`);
  return s as typeof s & { seller: NonNullable<typeof s.seller> };
}

/** Administrator only (moderators are redirected). */
export async function requireAdminOnly() {
  const s = await requireAdmin();
  if (!s.roles.includes("admin")) redirect("/admin");
  return s;
}
