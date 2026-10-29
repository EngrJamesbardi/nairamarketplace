"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { normalisePhone } from "@/lib/countries";
import { verifyUploadedImage } from "@/lib/storage";
import { sellerOnboardingSchema, fieldErrors, type ActionState } from "@/lib/validation";

export async function saveSellerProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, seller } = await getSession();
  if (!user) redirect("/auth/login?next=/onboarding/seller");
  const raw = Object.fromEntries(formData);
  const parsed = sellerOnboardingSchema.safeParse({ ...raw, deliveryOptions: formData.getAll("deliveryOptions") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: "Please fix the highlighted fields." };
  const v = parsed.data;

  const { data: country } = await supabase.from("countries").select("*").eq("code", v.countryCode).maybeSingle();
  if (!country) return { fieldErrors: { countryCode: "Choose a country" } };
  if (!country.is_active && !seller) return { fieldErrors: { countryCode: `${country.name} is not open for sellers yet` } };

  let whatsapp: string | null = null;
  if (v.whatsappNumber) {
    whatsapp = normalisePhone(v.whatsappNumber, country);
    if (!whatsapp) return { fieldErrors: { whatsappNumber: `Enter a valid ${country.name} mobile number` } };
  }
  let contactPhone: string | null = null;
  if (v.contactPhone) {
    contactPhone = normalisePhone(v.contactPhone, country);
    if (!contactPhone) return { fieldErrors: { contactPhone: `Enter a valid ${country.name} phone number` } };
  }

  let logoUrl: string | null | undefined = undefined;
  const logoPath = formData.get("logo");
  if (typeof logoPath === "string" && logoPath) {
    if (logoPath.startsWith("http")) logoUrl = undefined; // unchanged
    else {
      const res = await verifyUploadedImage(supabase, "avatars", logoPath, user.id);
      if (!res.ok) return { fieldErrors: { logo: res.reason } };
      logoUrl = res.url;
    }
  } else if (seller?.logo_url) {
    logoUrl = null; // removed
  }

  const row = {
    user_id: user.id,
    shop_name: v.shopName,
    slug: v.slug,
    seller_type: v.sellerType,
    description: v.description,
    country_code: v.countryCode,
    region_id: v.regionId ?? null,
    city: v.city,
    contact_email: v.contactEmail ?? null,
    contact_phone: contactPhone,
    whatsapp_number: whatsapp,
    show_whatsapp: v.showWhatsapp && !!whatsapp,
    business_name: v.businessName,
    business_registration_number: v.businessRegistrationNumber,
    business_hours: v.businessHours ? { text: v.businessHours } : null,
    delivery_options: v.deliveryOptions,
    delivery_notes: v.deliveryNotes,
    ...(logoUrl !== undefined && { logo_url: logoUrl }),
  };

  const { error } = seller
    ? await supabase.from("seller_profiles").update(row).eq("user_id", user.id)
    : await supabase.from("seller_profiles").insert(row);
  if (error) {
    if (error.code === "23505") return { fieldErrors: { slug: "That shop address is taken. Try another." } };
    return { error: friendlyError(error) };
  }
  revalidatePath(`/s/${v.slug}`);
  revalidatePath("/dashboard");
  const next = String(formData.get("next") ?? "");
  if (!seller) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard?welcome=1");
  return { ok: true, message: "Storefront saved." };
}
