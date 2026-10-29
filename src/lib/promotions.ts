import "server-only";
import type { ListingCard } from "@/components/ProductCard";

export type SponsoredItem = { campaignId: string; item: ListingCard };

/** Sponsored listings for a placement. Implemented in Phase 4 (promotion campaigns). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getSponsored(_placement: string, _country: string, _opts: { category?: string; query?: string; limit?: number } = {}): Promise<SponsoredItem[]> {
  return [];
}
