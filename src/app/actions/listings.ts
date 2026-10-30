"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { verifyUploadedImage } from "@/lib/storage";
import { providerCheckoutUrl } from "@/lib/payments/checkout";
import { listingSchema, fieldErrors, requiredPhotos, MAX_IMAGES, type ActionState } from "@/lib/validation";
import type { Database } from "@/types/database";

type ListingStatus = Database["public"]["Enums"]["listing_status"];

function parseForm(formData: FormData) {
  const attributes: Record<string, string | number> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("attr.") && typeof v === "string" && v.trim()) {
      const key = k.slice(5);
      if (/^[a-z_]{1,40}$/.test(key)) attributes[key] = /^\d+$/.test(v) ? Number(v) : v.trim().slice(0, 100);
    }
  }
  return listingSchema.safeParse({
    ...Object.fromEntries(formData),
    deliveryOptions: formData.getAll("deliveryOptions"),
    attributes,
  });
}

async function syncImages(
  supabase: Awaited<ReturnType<typeof getSession>>["supabase"],
  userId: string,
  listingId: string,
  paths: string[],
): Promise<string | null> {
  const { data: existing } = await supabase.from("listing_images").select("id, storage_path, url").eq("listing_id", listingId);
  const existingByPath = new Map((existing ?? []).map((e) => [e.storage_path, e]));
  const keep = new Set(paths);

  const toDelete = (existing ?? []).filter((e) => !keep.has(e.storage_path));
  if (toDelete.length) {
    await supabase.from("listing_images").delete().in("id", toDelete.map((d) => d.id));
    const ownObjects = toDelete.map((d) => d.storage_path).filter((p) => p.startsWith(`${userId}/`));
    if (ownObjects.length) await supabase.storage.from("listing-images").remove(ownObjects);
  }

  for (const [position, path] of paths.entries()) {
    const ex = existingByPath.get(path);
    if (ex) {
      await supabase.from("listing_images").update({ position }).eq("id", ex.id);
      continue;
    }
    const check = await verifyUploadedImage(supabase, "listing-images", path, userId);
    if (!check.ok) return check.reason;
    const { error } = await supabase.from("listing_images").insert({ listing_id: listingId, storage_path: path, url: check.url, position });
    if (error) return "Could not save a photo";
  }
  return null;
}

/** Server-side location check: the state must be in the listing's market and the LGA in that state. */
async function checkLocation(
  supabase: Awaited<ReturnType<typeof getSession>>["supabase"],
  country: { code: string; region_label: string; area_label: string | null },
  regionId: number | undefined,
  areaId: number | undefined,
  requireComplete: boolean,
): Promise<{ fieldErrors: Record<string, string> } | { region: { latitude: number | null; longitude: number | null } | null }> {
  const state = country.region_label.toLowerCase();
  if (!regionId) return requireComplete ? { fieldErrors: { regionId: `Choose the ${state}` } } : { region: null };
  const { data: region } = await supabase.from("regions").select("id, latitude, longitude").eq("id", regionId).eq("country_code", country.code).maybeSingle();
  if (!region) return { fieldErrors: { regionId: `Choose a ${state} in this market` } };
  if (country.area_label) {
    if (areaId) {
      const { data: area } = await supabase.from("areas").select("id").eq("id", areaId).eq("region_id", regionId).eq("is_active", true).maybeSingle();
      if (!area) return { fieldErrors: { areaId: `That ${country.area_label} is not in the selected ${state}` } };
    } else if (requireComplete) {
      const { count } = await supabase.from("areas").select("id", { count: "exact", head: true }).eq("region_id", regionId).eq("is_active", true);
      if (count) return { fieldErrors: { areaId: `Choose the ${country.area_label}` } };
    }
  } else if (areaId) {
    return { fieldErrors: { areaId: "Not available in this market" } };
  }
  return { region: { latitude: region.latitude, longitude: region.longitude } };
}

export async function saveListing(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, seller, profile } = await getSession();
  if (!user) redirect("/auth/login?next=/sell");
  if (!seller) redirect("/onboarding/seller?next=/sell");
  if (profile?.status !== "active") return { error: "Your account cannot post listings right now." };

  const parsed = parseForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: "Please fix the highlighted fields." };
  const v = parsed.data;
  const images = [...new Set(formData.getAll("images").filter((x): x is string => typeof x === "string"))];
  if (images.length > MAX_IMAGES) return { fieldErrors: { images: `Use at most ${MAX_IMAGES} photos` }, error: `A listing can have at most ${MAX_IMAGES} photos.` };

  let listingId = String(formData.get("id") ?? "");
  // One id per form: a double tap, or a retry after a lost redirect, resolves to the listing already created.
  const requestId = z.uuid().safeParse(formData.get("requestId"));
  const findByRequest = async () =>
    requestId.success
      ? (await supabase.from("listings").select("id").eq("seller_id", user.id).eq("client_request_id", requestId.data).maybeSingle()).data?.id
      : undefined;
  if (!z.uuid().safeParse(listingId).success) listingId = (await findByRequest()) ?? "";
  let isEdit = z.uuid().safeParse(listingId).success;

  const { data: current } = isEdit
    ? await supabase.from("listings").select("seller_id, status, country_code, images:listing_images(id)").eq("id", listingId).maybeSingle()
    : { data: null };
  // RLS would also block this; checking here gives a clear error.
  if (isEdit && (!current || current.seller_id !== user.id)) return { error: "Listing not found." };
  const publishing = v.status === "active" && (!current || current.status === "draft");
  const countryCode = current?.country_code ?? seller.country_code;

  const [{ data: country }, { data: category }] = await Promise.all([
    supabase.from("countries").select("code, region_label, area_label").eq("code", countryCode).single(),
    supabase.from("categories").select("min_images, name").eq("id", v.categoryId).maybeSingle(),
  ]);
  if (!country) return { error: "This market is not available." };

  // Photos: a category-specific minimum to publish; a live listing being edited keeps at least what it had.
  if (v.status === "active") {
    const need = requiredPhotos(category?.min_images ?? 4, { publishing, savedCount: current?.images.length ?? 0 });
    if (images.length < need) {
      const msg = `Add at least ${need} photo${need === 1 ? "" : "s"} to ${publishing ? "publish" : "save"}${publishing && category ? ` in ${category.name}` : ""} (you have ${images.length}).`;
      return { fieldErrors: { images: msg }, error: msg };
    }
  }

  const loc = await checkLocation(supabase, country, v.regionId, v.areaId, v.status === "active" && publishing);
  if ("fieldErrors" in loc) return { fieldErrors: loc.fieldErrors, error: "Please check the location." };

  const row = {
    title: v.title,
    description: v.description,
    category_id: v.categoryId,
    subcategory_id: v.subcategoryId ?? null,
    price_type: v.priceType,
    price_minor: v.priceMinor === null ? null : Number(v.priceMinor),
    currency: v.currency,
    condition: v.condition,
    quantity: v.quantity,
    region_id: v.regionId ?? null,
    area_id: v.areaId ?? null,
    city: v.city,
    latitude: loc.region?.latitude ?? null,
    longitude: loc.region?.longitude ?? null,
    delivery_options: v.deliveryOptions,
    delivery_notes: v.deliveryNotes,
    attributes: v.attributes,
  };
  const failed = (error: { message?: string; code?: string; hint?: string } | null): ActionState =>
    error?.hint === "listing_limit" ? { error: friendlyError(error), code: "listing_limit" } : { error: friendlyError(error) };

  let id = listingId;
  if (!isEdit) {
    const { data, error } = await supabase
      .from("listings")
      .insert({ ...row, seller_id: user.id, country_code: seller.country_code, status: v.status, client_request_id: requestId.success ? requestId.data : null })
      .select("id")
      .single();
    if (data) id = data.id;
    else {
      // A simultaneous duplicate submission lost the race to the unique index: continue with the first one.
      const existing = error?.code === "23505" ? await findByRequest() : undefined;
      if (!existing) return failed(error);
      id = listingId = existing;
      isEdit = true;
    }
  }
  if (isEdit) {
    const nextStatus = current?.status === "draft" ? v.status : (current?.status ?? v.status);
    const { error } = await supabase.from("listings").update({ ...row, status: nextStatus }).eq("id", listingId);
    if (error) return failed(error);
  }

  const imgErr = await syncImages(supabase, user.id, id, images);
  if (imgErr) return { error: imgErr, fieldErrors: { images: imgErr } };

  revalidatePath(`/listing/${id}`);
  revalidatePath("/dashboard/listings");
  revalidatePath("/");

  // Optional paid promotion: creates a pending payment and sends the seller to the provider. The listing is already
  // published as a standard listing; the promotion only starts when the provider's verified webhook confirms payment.
  if (publishing && v.promotionPackage) {
    const { data: pay, error } = await supabase.rpc("start_promotion_checkout", { p_package: v.promotionPackage, p_listing: id });
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    const res = error || !pay?.[0] ? { error: friendlyError(error, "Could not start the payment.") } : await providerCheckoutUrl(pay[0], user.email ?? "", origin);
    if ("error" in res) {
      return { ok: true, redirectTo: `/dashboard/promotions?saved=${id}&error=${encodeURIComponent(`Your listing is published, but the promotion could not start: ${res.error}`)}` };
    }
    return { ok: true, redirectTo: res.url };
  }
  // Returned rather than redirect(): on phones the streamed redirect response was sometimes dropped, leaving the
  // seller on a "Saving…" form after the listing had been saved. The form navigates with a full page load instead.
  return { ok: true, redirectTo: `/dashboard/listings?saved=${id}` };
}

const transitions: Record<string, { to: ListingStatus; from: ListingStatus[] }> = {
  publish: { to: "active", from: ["draft"] },
  pause: { to: "paused", from: ["active", "reserved"] },
  activate: { to: "active", from: ["paused", "reserved"] },
  reserve: { to: "reserved", from: ["active"] },
  archive: { to: "archived", from: ["draft", "active", "paused", "reserved", "sold", "expired"] },
  unarchive: { to: "paused", from: ["archived"] },
};

export async function changeListingStatus(formData: FormData): Promise<void> {
  const { supabase, user } = await getSession();
  if (!user) redirect("/auth/login");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!z.uuid().safeParse(id).success) return;
  let errorMsg: string | null = null;

  if (action === "renew") {
    const { error } = await supabase.rpc("renew_listing", { p_listing: id });
    if (error) errorMsg = friendlyError(error);
  } else if (action === "sold") {
    const buyer = String(formData.get("buyer") ?? "");
    const { error } = await supabase.rpc("mark_listing_sold", { p_listing: id, p_buyer: z.uuid().safeParse(buyer).success ? buyer : undefined });
    if (error) errorMsg = friendlyError(error);
  } else if (transitions[action]) {
    const tr = transitions[action];
    const { data, error } = await supabase
      .from("listings")
      .update({ status: tr.to })
      .eq("id", id)
      .eq("seller_id", user.id)
      .in("status", tr.from)
      .select("id");
    if (error) errorMsg = friendlyError(error);
    else if (!data?.length) errorMsg = "That change isn't possible for this listing.";
  }
  revalidatePath("/dashboard/listings");
  revalidatePath(`/listing/${id}`);
  redirect(`/dashboard/listings${errorMsg ? `?error=${encodeURIComponent(errorMsg)}` : `?updated=${id}`}`);
}
