"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { ActionState } from "@/lib/validation";

const schema = z.object({ listingId: z.uuid(), rating: z.coerce.number().int().min(1).max(5), body: z.string().trim().max(1000).optional() });

export async function submitReview(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again." };
  const p = schema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: "Choose a rating between 1 and 5." };
  const { error } = await supabase.rpc("submit_review", { p_listing: p.data.listingId, p_rating: p.data.rating, p_body: p.data.body ?? "" });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/s", "layout");
  return { ok: true, message: "Thanks for your review." };
}

export async function replyToReview(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again." };
  const id = String(formData.get("reviewId") ?? "");
  const reply = String(formData.get("reply") ?? "").trim().slice(0, 1000);
  const { error } = await supabase.from("reviews").update({ seller_reply: reply || null }).eq("id", id).eq("seller_id", user.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/dashboard");
  return { ok: true, message: "Reply saved." };
}
