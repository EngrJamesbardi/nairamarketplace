"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";

export async function markAllNotificationsRead() {
  const { supabase, user } = await getSession();
  if (!user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
