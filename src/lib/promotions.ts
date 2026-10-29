import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ListingCard } from "@/components/ProductCard";

export type SponsoredItem = { campaignId: string; item: ListingCard };
type Placement = "search" | "homepage" | "category";

/**
 * Sponsored listings for a placement: live campaigns only, on visible listings, matched to the current search
 * or category when there is one, rotated randomly and capped by the max_sponsored_per_page setting.
 * Always rendered with a "Sponsored" label and kept separate from organic results.
 */
export async function getSponsored(placement: Placement, country: string, opts: { category?: string; query?: string; limit?: number } = {}): Promise<SponsoredItem[]> {
  const supabase = await createClient();
  const { data: picks, error } = await supabase.rpc("get_sponsored", {
    p_placement: placement,
    p_country: country,
    p_category: opts.category || undefined,
    p_query: opts.query || undefined,
    p_limit: opts.limit ?? 2,
  });
  if (error || !picks?.length) return [];
  const { data: cards } = await supabase.from("listing_cards").select("*").in("id", picks.map((p) => p.listing_id));
  const byId = new Map((cards ?? []).map((c) => [c.id, c as ListingCard]));
  return picks.flatMap((p) => (byId.has(p.listing_id) ? [{ campaignId: p.campaign_id, item: byId.get(p.listing_id)! }] : []));
}
