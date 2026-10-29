import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getUnreadCounts(userId: string): Promise<{ messages: number; notifications: number }> {
  const supabase = await createClient();
  const [m, n] = await Promise.all([
    supabase.rpc("unread_message_count"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  return { messages: m.data ?? 0, notifications: n.count ?? 0 };
}
