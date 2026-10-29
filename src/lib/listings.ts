import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ListingCard } from "@/components/ProductCard";

export async function discover(country: string, opts: { order?: "newest" | "popular"; negotiable?: boolean; regionId?: number | null; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("listing_cards")
    .select("*")
    .eq("country_code", country)
    .eq("status", "active")
    .eq("moderation_status", "approved");
  if (opts.negotiable) q = q.eq("price_type", "negotiable");
  if (opts.regionId) q = q.eq("region_id", opts.regionId);
  if (opts.order === "popular") q = q.order("favourite_count", { ascending: false }).order("view_count", { ascending: false });
  q = q.order("published_at", { ascending: false }).limit(opts.limit ?? 10);
  const { data, error } = await q;
  return { data: (data ?? []) as ListingCard[], error };
}

export async function favouriteIds(userId: string | undefined, ids: (string | null)[]): Promise<Set<string>> {
  if (!userId || ids.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from("favourites")
    .select("listing_id")
    .eq("user_id", userId)
    .in("listing_id", ids.filter(Boolean) as string[]);
  return new Set((data ?? []).map((f) => f.listing_id));
}
