import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * LGAs (second-level areas) of one state, for the dependent location selects. Public reference data, so it is cacheable;
 * served from here rather than the browser Supabase client to keep that client out of the homepage bundle.
 */
export async function GET(request: NextRequest) {
  const region = Number(request.nextUrl.searchParams.get("region"));
  if (!Number.isInteger(region) || region <= 0) return NextResponse.json({ error: "Invalid region" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("areas").select("id, name").eq("region_id", region).eq("is_active", true).order("name");
  if (error) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } });
}
