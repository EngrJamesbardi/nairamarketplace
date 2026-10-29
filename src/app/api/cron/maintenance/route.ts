import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping: expire listings, offers, promotions and plans; apply data-retention rules.
 * Call from a scheduler with "Authorization: Bearer $CRON_SECRET" (see docs/DEPLOYMENT.md).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (secret.length < 16 || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc("purge_expired_data");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
