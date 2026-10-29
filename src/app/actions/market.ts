"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COUNTRY_COOKIE } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";

export async function setCountry(formData: FormData) {
  const code = String(formData.get("country") ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("countries").select("code").eq("code", code).eq("is_active", true).maybeSingle();
  if (!data) return;
  (await cookies()).set(COUNTRY_COOKIE, code, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
