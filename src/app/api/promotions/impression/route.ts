import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { viewerKey } from "@/lib/viewer";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";

const body = z.object({ ids: z.array(z.uuid()).min(1).max(6) });

/** Sent by the browser when a sponsored card has actually been on screen. One count per viewer per campaign per day. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`promo-imp:${ip}`, 120, 60_000).ok) return new NextResponse(null, { status: 429 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const key = await viewerKey(user?.id);
  const admin = createAdminClient();
  await Promise.all([...new Set(parsed.data.ids)].map((id) => admin.rpc("record_promotion_event", { p_campaign: id, p_kind: "impression", p_viewer_key: key, p_viewer: user?.id })));
  return new NextResponse(null, { status: 204 });
}
