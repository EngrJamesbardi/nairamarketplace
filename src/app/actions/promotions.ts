"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { fieldErrors, type ActionState } from "@/lib/validation";

const schema = z.object({
  listingId: z.uuid("Choose a listing"),
  placement: z.enum(["search", "homepage", "category"]),
  days: z.coerce.number().int().min(1, "At least 1 day").max(30, "At most 30 days"),
});

export async function createPromotion(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await supabase.rpc("create_promotion", { p_listing: parsed.data.listingId, p_placement: parsed.data.placement, p_days: parsed.data.days });
  if (error) return { error: error.code === "P0402" ? "You don't have enough credits for this promotion. Buy credits or choose fewer days." : friendlyError(error) };
  revalidatePath("/dashboard/promotions");
  revalidatePath("/dashboard/credits");
  return { ok: true, message: "Promotion started. It is shown with a “Sponsored” label." };
}

export async function cancelPromotion(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again." };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid promotion" };
  const { data, error } = await supabase.rpc("cancel_promotion", { p_id: id.data });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/dashboard/promotions");
  return { ok: true, message: data ? `Promotion stopped. ${data} credits refunded for unused days.` : "Promotion stopped. No whole days were left to refund." };
}
