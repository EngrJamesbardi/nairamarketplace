"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { safeNextPath } from "@/lib/safe-path";
import { signInSchema, signUpSchema, passwordSchema, fieldErrors, type ActionState } from "@/lib/validation";

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000).ok) return { error: "Too many sign-up attempts. Please try again later." };
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { email, password, displayName, countryCode } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${site()}/auth/callback?next=/onboarding/welcome`,
      data: { display_name: displayName, country_code: countryCode },
    },
  });
  // Do not reveal whether an email is already registered.
  if (error && !/already registered/i.test(error.message)) {
    if (/password/i.test(error.message)) return { fieldErrors: { password: error.message } };
    return { error: "We couldn't create your account. Please try again." };
  }
  redirect(`/auth/check-email?email=${encodeURIComponent(email)}`);
}

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const ip = await clientIp();
  if (!rateLimit(`signin:${ip}:${parsed.data.email}`, 8, 10 * 60 * 1000).ok)
    return { error: "Too many sign-in attempts. Please wait 10 minutes or reset your password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (/confirm/i.test(error.message)) return { error: "Please verify your email first. Check your inbox for the link." };
    return { error: "Incorrect email or password." };
  }
  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?signedout=1");
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = await clientIp();
  if (!rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000).ok) return { error: "Too many requests. Please try again later." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { fieldErrors: { email: "Enter a valid email address" } };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site()}/auth/callback?next=/auth/reset` });
  // Same response whether or not the account exists.
  return { ok: true, message: "If an account exists for that email, we've sent a password reset link." };
}

export async function updatePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0].message } };
  if (formData.get("password") !== formData.get("confirm")) return { fieldErrors: { confirm: "Passwords do not match" } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Your reset link may have expired. Please request a new one." };
  redirect("/account?password=updated");
}
