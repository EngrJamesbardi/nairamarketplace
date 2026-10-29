"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { ActionState } from "@/lib/validation";

export async function toggleFavourite(listingId: string): Promise<{ ok?: boolean; redirect?: string; favourited?: boolean }> {
  const { supabase, user } = await getSession();
  if (!user) return { redirect: `/auth/login?next=/listing/${listingId}` };
  if (!z.uuid().safeParse(listingId).success) return { ok: false };
  const { data: existing } = await supabase.from("favourites").select("listing_id").eq("user_id", user.id).eq("listing_id", listingId).maybeSingle();
  if (existing) {
    await supabase.from("favourites").delete().eq("user_id", user.id).eq("listing_id", listingId);
    revalidatePath("/favourites");
    return { ok: true, favourited: false };
  }
  const { error } = await supabase.from("favourites").insert({ user_id: user.id, listing_id: listingId });
  revalidatePath("/favourites");
  return { ok: !error, favourited: !error };
}

export async function toggleFollow(sellerId: string, slug: string): Promise<{ redirect?: string; following?: boolean }> {
  const { supabase, user } = await getSession();
  if (!user) return { redirect: `/auth/login?next=/s/${slug}` };
  if (!z.uuid().safeParse(sellerId).success) return {};
  const { data: existing } = await supabase.from("seller_follows").select("seller_id").eq("follower_id", user.id).eq("seller_id", sellerId).maybeSingle();
  if (existing) {
    await supabase.from("seller_follows").delete().eq("follower_id", user.id).eq("seller_id", sellerId);
  } else {
    await supabase.from("seller_follows").insert({ follower_id: user.id, seller_id: sellerId });
  }
  revalidatePath(`/s/${slug}`);
  return { following: !existing };
}

const reportSchema = z.object({
  targetType: z.enum(["listing", "user", "message", "review"]),
  listingId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  userId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  messageId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  reviewId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  reason: z.enum(["prohibited_item", "scam_or_fraud", "counterfeit", "misleading", "offensive", "harassment", "spam", "wrong_category", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export async function submitReport(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in to report." };
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please choose a reason." };
  const v = parsed.data;
  const { error } = await supabase.from("reports").insert({
    target_type: v.targetType,
    listing_id: v.listingId ?? null,
    reported_user_id: v.userId ?? null,
    message_id: v.messageId ?? null,
    review_id: v.reviewId ?? null,
    reason: v.reason,
    details: v.details || null,
  });
  if (error) return { error: friendlyError(error) };
  return { ok: true, message: "Thanks. Our moderators will review this report." };
}

export async function toggleBlock(userId: string, redirectTo?: string): Promise<{ blocked?: boolean; error?: string }> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Sign in required" };
  if (!z.uuid().safeParse(userId).success || userId === user.id) return { error: "Invalid user" };
  const { data: existing } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", userId).maybeSingle();
  if (existing) await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
  else await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: userId });
  if (redirectTo) revalidatePath(redirectTo);
  return { blocked: !existing };
}
