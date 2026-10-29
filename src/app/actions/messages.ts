"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { parseToMinor } from "@/lib/money";
import type { ActionState } from "@/lib/validation";

const bodySchema = z.string().trim().min(1, "Write a message").max(2000, "Messages are limited to 2000 characters");

export async function contactSeller(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  const listingId = String(formData.get("listingId") ?? "");
  if (!user) redirect(`/auth/login?next=/listing/${listingId}`);
  const body = bodySchema.safeParse(formData.get("body"));
  if (!body.success) return { error: body.error.issues[0].message };
  const { data, error } = await supabase.rpc("start_conversation", { p_listing: listingId, p_body: body.data });
  if (error) return { error: friendlyError(error) };
  redirect(`/messages/${data}`);
}

export async function sendMessage(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again." };
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = bodySchema.safeParse(formData.get("body"));
  if (!body.success) return { error: body.error.issues[0].message };
  const { error } = await supabase.rpc("send_message", { p_conversation: conversationId, p_body: body.data });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/messages/${conversationId}`);
  return { ok: true };
}

export async function makeOffer(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  const listingId = String(formData.get("listingId") ?? "");
  if (!user) redirect(`/auth/login?next=/listing/${listingId}`);
  const currency = String(formData.get("currency") ?? "");
  const amount = parseToMinor(String(formData.get("amount") ?? ""), currency);
  if (amount === null || amount <= 0n) return { fieldErrors: { amount: "Enter a valid amount" } };
  const quantity = Number(formData.get("quantity") ?? 1) || 1;
  const note = String(formData.get("note") ?? "").slice(0, 500) || undefined;
  const { error } = await supabase.rpc("make_offer", { p_listing: listingId, p_amount_minor: Number(amount), p_quantity: quantity, p_note: note });
  if (error) return { error: friendlyError(error) };
  const { data: conv } = await supabase.from("conversations").select("id").eq("listing_id", listingId).eq("buyer_id", user.id).maybeSingle();
  redirect(conv ? `/messages/${conv.id}` : `/listing/${listingId}`);
}

export async function respondOffer(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Please sign in again." };
  const offerId = String(formData.get("offerId") ?? "");
  const action = String(formData.get("action") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  if (action === "withdraw") {
    const { error } = await supabase.rpc("withdraw_offer", { p_offer: offerId });
    if (error) return { error: friendlyError(error) };
  } else {
    let counter: number | undefined;
    if (action === "counter") {
      const amt = parseToMinor(String(formData.get("amount") ?? ""), String(formData.get("currency") ?? ""));
      if (amt === null || amt <= 0n) return { error: "Enter a valid counter-offer amount" };
      counter = Number(amt);
    }
    const { error } = await supabase.rpc("respond_offer", { p_offer: offerId, p_action: action, p_counter_amount_minor: counter });
    if (error) return { error: friendlyError(error) };
  }
  revalidatePath(`/messages/${conversationId}`);
  return { ok: true };
}

export async function markRead(conversationId: string) {
  const { supabase, user } = await getSession();
  if (!user) return;
  await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
}

export async function recordView(listingId: string) {
  if (!z.uuid().safeParse(listingId).success) return;
  const { supabase, user } = await getSession();
  const jar = await cookies();
  let key = user?.id ?? jar.get("nm_vid")?.value;
  if (!key) {
    key = crypto.randomUUID();
    jar.set("nm_vid", key, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  }
  await supabase.rpc("record_listing_view", { p_listing: listingId, p_viewer_key: key });
}
