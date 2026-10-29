"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { normalisePhone } from "@/lib/countries";
import { profileSchema, fieldErrors, type ActionState } from "@/lib/validation";

export async function updateProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again." };
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { data: country } = await supabase.from("countries").select("*").eq("code", v.countryCode).maybeSingle();
  if (!country) return { fieldErrors: { countryCode: "Choose a country" } };
  let phone: string | null = null;
  if (v.phone) {
    phone = normalisePhone(v.phone, country);
    if (!phone) return { fieldErrors: { phone: `Enter a valid ${country.name} phone number` } };
  }
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: v.displayName, bio: v.bio, country_code: v.countryCode, region_id: v.regionId ?? null, city: v.city, phone, preferred_language: v.preferredLanguage })
    .eq("id", user.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/account");
  return { ok: true, message: "Profile saved." };
}

const PREF_KEYS = ["messages", "offers", "follows", "listing_updates", "marketing"] as const;

export async function updatePreferences(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { error: "Please sign in again." };
  const prefs = Object.fromEntries(PREF_KEYS.map((k) => [k, formData.get(k) === "on"]));
  const marketingChanged = prefs.marketing !== Boolean((profile?.notification_prefs as Record<string, boolean>)?.marketing);
  const { error } = await supabase
    .from("profiles")
    .update({ notification_prefs: prefs, ...(marketingChanged && { marketing_consent_at: prefs.marketing ? new Date().toISOString() : null }) })
    .eq("id", user.id);
  if (error) return { error: friendlyError(error) };
  const theme = formData.get("theme") === "dark" ? "dark" : "light";
  (await cookies()).set("nm_theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true, message: "Preferences saved." };
}
