"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMfaState, getSession, requireUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { safeNextPath } from "@/lib/safe-path";
import type { ActionState } from "@/lib/validation";

/**
 * Two-step verification (TOTP authenticator apps). Codes, setup keys and QR codes are never logged or stored by the app:
 * Supabase Auth keeps the factor secret, and enrolment happens in the browser (src/app/account/security/enroll.tsx).
 * Security events are logged as one JSON line each, with ids only.
 */
const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");
const factorId = z.uuid();

function securityLog(event: string, fields: Record<string, unknown>) {
  console.warn(JSON.stringify({ type: "security", event, at: new Date().toISOString(), ...fields }));
}

async function audit(actorId: string, action: string, factor: { id: string; friendly_name?: string | null }) {
  const { error } = await createAdminClient()
    .from("admin_audit_logs")
    .insert({ actor_id: actorId, action, target_type: "user", target_id: actorId, details: { factor_id: factor.id, name: factor.friendly_name ?? null } });
  if (error) securityLog("mfa.audit_failed", { user: actorId, action });
}

/** The code step after password sign-in (and for sessions that were open before an authenticator was added). */
export async function verifyMfaCode(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser("/auth/mfa");
  const parsedCode = code.safeParse(formData.get("code"));
  if (!parsedCode.success) return { fieldErrors: { code: parsedCode.error.issues[0].message } };
  const ip = await clientIp();
  // Supabase Auth also limits verification attempts; this keeps guessing slow per account and per address.
  if (!(await rateLimit(`mfa:${user.id}`, 10, 10 * 60 * 1000)).ok || !(await rateLimit(`mfa-ip:${ip}`, 30, 10 * 60 * 1000)).ok) {
    securityLog("mfa.rate_limited", { user: user.id });
    return { error: "Too many attempts. Please wait 10 minutes and try again." };
  }
  const { factors } = await getMfaState();
  const chosen = factorId.safeParse(formData.get("factorId"));
  const factor = factors.find((f) => f.id === (chosen.success ? chosen.data : undefined)) ?? factors[0];
  if (!factor) redirect("/account/security");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsedCode.data });
  if (error) {
    securityLog("mfa.verify_failed", { user: user.id, factor: factor.id, reason: error.code ?? "error" });
    return { fieldErrors: { code: "That code didn't work. Check the time on your phone is set automatically, then try the newest code." } };
  }
  securityLog("mfa.verified", { user: user.id, factor: factor.id });
  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next"), "/"));
}

/**
 * Called by the browser after it has enrolled and verified a new authenticator. Only records the event: the factor is
 * looked up from Supabase Auth, so a forged call cannot log a factor that does not exist.
 */
export async function recordFactorAdded(id: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireUser("/account/security");
  const parsed = factorId.safeParse(id);
  if (!parsed.success) return { ok: false };
  const { data } = await supabase.auth.getUser();
  const factor = data.user?.factors?.find((f) => f.id === parsed.data && f.status === "verified");
  if (!factor) return { ok: false };
  securityLog("mfa.enrolled", { user: user.id, factor: factor.id });
  await audit(user.id, "mfa.enrolled", factor);
  return { ok: true };
}

/** Remove an authenticator. Needs a session that passed two-step verification (Supabase Auth enforces this too). */
export async function removeFactor(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, roles } = await requireUser("/account/security");
  const parsed = factorId.safeParse(formData.get("factorId"));
  if (!parsed.success) return { error: "Choose an authenticator to remove." };
  const mfa = await getMfaState();
  const factor = mfa.factors.find((f) => f.id === parsed.data);
  if (!factor) return { error: "That authenticator was not found. Refresh the page and try again." };
  if (mfa.level !== "aal2") return { error: "Confirm a code from your authenticator first, then remove it." };
  const isLast = mfa.factors.length === 1;
  if (isLast && isStaffRole(roles) && String(formData.get("confirm") ?? "").trim() !== "REMOVE")
    return { fieldErrors: { confirm: "Type REMOVE to confirm. You will need to set up an authenticator again to use Admin." } };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) {
    securityLog("mfa.remove_failed", { user: user.id, factor: factor.id, reason: error.code ?? "error" });
    return { error: "We couldn't remove that authenticator. Please try again." };
  }
  securityLog("mfa.removed", { user: user.id, factor: factor.id });
  await audit(user.id, "mfa.removed", factor);
  // Removing the last authenticator lowers the session to a password-only one; refresh it so pages see that straight away.
  if (isLast) await supabase.auth.refreshSession();
  revalidatePath("/account/security");
  redirect("/account/security?removed=1");
}

/** Leave the code step: sign out completely rather than keep a half-verified session. */
export async function cancelMfa() {
  const { supabase } = await getSession();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/login");
}
