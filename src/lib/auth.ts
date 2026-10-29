import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

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
  if (s.profile?.status === "suspended") redirect("/account/suspended");
  return s as typeof s & { user: NonNullable<typeof s.user> };
}

/** Server-side admin check. The database independently re-checks via is_admin() in every admin RPC. */
export async function requireAdmin() {
  const s = await requireUser("/admin");
  if (!s.roles.includes("admin") && !s.roles.includes("moderator")) redirect("/");
  return s;
}

export async function requireSeller(next = "/dashboard") {
  const s = await requireUser(next);
  if (!s.seller) redirect(`/onboarding/seller?next=${encodeURIComponent(next)}`);
  return s as typeof s & { seller: NonNullable<typeof s.seller> };
}
