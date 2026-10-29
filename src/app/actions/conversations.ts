"use server";
import { z } from "zod";
import { getSession } from "@/lib/auth";

export async function archiveConversation(conversationId: string) {
  const { supabase, user } = await getSession();
  if (!user || !z.uuid().safeParse(conversationId).success) return;
  await supabase.from("conversation_participants").update({ archived_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("user_id", user.id);
}
