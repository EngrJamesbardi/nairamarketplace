"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/validation";

/** Deactivation hides the profile, storefront and listings until the member reactivates. Data is kept. */
export async function setDeactivated(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return { error: "Please sign in again." };
  const deactivate = formData.get("deactivate") === "1";
  if (deactivate && profile.status !== "active") return { error: "Only active accounts can be deactivated." };
  if (!deactivate && profile.status !== "deactivated") return { error: "Your account is not deactivated." };
  const { error } = await supabase
    .from("profiles")
    .update({ status: deactivate ? "deactivated" : "active", deactivated_at: deactivate ? new Date().toISOString() : null })
    .eq("id", user.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: deactivate ? "Your account is deactivated. Your listings are hidden." : "Welcome back. Your account is active again." };
}

/**
 * Permanent deletion: anonymises profile + storefront in the database (as the user, audited), then soft-deletes
 * the auth identity with the service-role key so the email can no longer sign in. Requires typing DELETE.
 */
export async function deleteAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again." };
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") return { fieldErrors: { confirm: "Type DELETE to confirm" } };
  if (!rateLimit(`delete:${user.id}`, 3, 3600_000).ok) return { error: "Too many attempts. Try again later." };
  const { error } = await supabase.rpc("anonymise_my_account");
  if (error) return { error: friendlyError(error) };
  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id, true);
  if (authErr) {
    // Profile is already anonymised and marked deleted; the identity removal can be retried by an administrator.
    console.error("auth soft-delete failed", authErr.message);
  }
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
