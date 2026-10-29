"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { verifyUploadedImage } from "@/lib/storage";
import { listingSchema, fieldErrors, MAX_IMAGES, type ActionState } from "@/lib/validation";
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

export async function saveListing(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, seller, profile } = await getSession();
  if (!user) redirect("/auth/login?next=/sell");
  if (!seller) redirect("/onboarding/seller?next=/sell");
  if (profile?.status !== "active") return { error: "Your account cannot post listings right now." };

  const parsed = parseForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: "Please fix the highlighted fields." };
  const v = parsed.data;
  const images = formData.getAll("images").filter((x): x is string => typeof x === "string").slice(0, MAX_IMAGES);
  if (v.status === "active" && images.length === 0) return { fieldErrors: { images: "Add at least one photo to publish" }, error: "Add at least one photo." };

  const listingId = String(formData.get("id") ?? "");
  const isEdit = z.uuid().safeParse(listingId).success;

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
    city: v.city,
    delivery_options: v.deliveryOptions,
    delivery_notes: v.deliveryNotes,
    attributes: v.attributes,
  };

  let id = listingId;
  if (isEdit) {
    const { data: current } = await supabase.from("listings").select("seller_id, status").eq("id", listingId).maybeSingle();
    // RLS would also block this; checking here gives a clear error.
    if (!current || current.seller_id !== user.id) return { error: "Listing not found." };
    const nextStatus = current.status === "draft" ? v.status : current.status;
    const { error } = await supabase.from("listings").update({ ...row, status: nextStatus }).eq("id", listingId);
    if (error) return { error: friendlyError(error) };
  } else {
    const { data: region } = v.regionId ? await supabase.from("regions").select("latitude, longitude").eq("id", v.regionId).maybeSingle() : { data: null };
    const { data, error } = await supabase
      .from("listings")
      .insert({ ...row, seller_id: user.id, country_code: seller.country_code, status: v.status, latitude: region?.latitude ?? null, longitude: region?.longitude ?? null })
      .select("id")
      .single();
    if (error) return { error: friendlyError(error) };
    id = data.id;
  }

  const imgErr = await syncImages(supabase, user.id, id, images);
  if (imgErr) return { error: imgErr, fieldErrors: { images: imgErr } };

  revalidatePath(`/listing/${id}`);
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
  redirect(`/dashboard/listings?saved=${id}`);
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
