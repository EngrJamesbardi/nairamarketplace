import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Data export (right of access / portability, e.g. NDPA 2023, Ghana DPA 2012, Kenya DPA 2019, POPIA).
 * Runs with the member's own session, so RLS limits it to data they are entitled to see.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await rateLimit(`export:${user.id}`, 5, 3600_000)).ok) return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });

  const uid = user.id;
  const [profile, roles, seller, listings, favourites, following, followers, blocked, convs, offers, reviewsWritten, reviewsReceived, reports, notifications, verifications] =
    await Promise.all([
      supabase.rpc("get_my_profile"),
      supabase.from("user_roles").select("role, created_at").eq("user_id", uid),
      supabase.from("seller_profiles").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("listings").select("*, listing_images(storage_path, position)").eq("seller_id", uid),
      supabase.from("favourites").select("listing_id, created_at").eq("user_id", uid),
      supabase.from("seller_follows").select("seller_id, created_at").eq("follower_id", uid),
      supabase.from("seller_follows").select("created_at", { count: "exact" }).eq("seller_id", uid),
      supabase.from("blocked_users").select("blocked_id, created_at").eq("blocker_id", uid),
      supabase.from("conversations").select("id, listing_id, buyer_id, seller_id, created_at, messages(id, sender_id, body, kind, created_at)"),
      supabase.from("offers").select("*").or(`buyer_id.eq.${uid},seller_id.eq.${uid}`),
      supabase.from("reviews").select("*").eq("reviewer_id", uid),
      supabase.from("reviews").select("*").eq("seller_id", uid),
      supabase.from("reports").select("*").eq("reporter_id", uid),
      supabase.from("notifications").select("*").eq("user_id", uid),
      supabase.from("seller_verifications").select("*").eq("seller_id", uid),
    ]);

  const body = {
    exported_at: new Date().toISOString(),
    notice: "Your Naira Marketplace data. Messages include those sent by the other party in your conversations.",
    account: { id: uid, email: user.email, created_at: user.created_at, email_confirmed_at: user.email_confirmed_at, last_sign_in_at: user.last_sign_in_at },
    profile: profile.data,
    roles: roles.data,
    storefront: seller.data,
    listings: listings.data,
    favourites: favourites.data,
    following: following.data,
    follower_count: followers.count,
    blocked_members: blocked.data,
    conversations: convs.data,
    offers: offers.data,
    reviews_written: reviewsWritten.data,
    reviews_received: reviewsReceived.data,
    reports_filed: reports.data,
    notifications: notifications.data,
    verification_requests: verifications.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="naira-marketplace-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
