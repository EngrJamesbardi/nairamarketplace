import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { viewerKey } from "@/lib/viewer";
import { rateLimit } from "@/lib/rate-limit";

/** Counts a click on a sponsored card (once per viewer per day), then opens the listing. */
export async function GET(request: NextRequest) {
  const c = z.uuid().safeParse(request.nextUrl.searchParams.get("c"));
  const l = z.uuid().safeParse(request.nextUrl.searchParams.get("l"));
  if (!l.success) return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  const target = NextResponse.redirect(new URL(`/listing/${l.data}`, request.nextUrl.origin));
  const ua = request.headers.get("user-agent") ?? "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (c.success && !/bot|crawl|spider|preview/i.test(ua) && (await rateLimit(`promo-click:${ip}`, 60, 60_000)).ok) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const key = await viewerKey(user?.id);
    await createAdminClient().rpc("record_promotion_event", { p_campaign: c.data, p_kind: "click", p_viewer_key: key, p_viewer: user?.id });
  }
  return target;
}
