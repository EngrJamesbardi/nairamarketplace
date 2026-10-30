import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { getAreas, getCategories, getCountries, getRegions } from "@/lib/market";
import { getProvider } from "@/lib/payments";
import { ListingForm } from "@/components/ListingForm";
import { ListingActions } from "../../../row-actions";

export const metadata = { title: "Edit listing" };

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, seller } = await requireSeller();
  const { data: listing } = await supabase.from("listings").select("*, images:listing_images(storage_path, url, position)").eq("id", id).eq("seller_id", user.id).maybeSingle();
  if (!listing) notFound();
  const [categories, regions, countries, areas, { data: packages }, { data: limit }, { data: active }] = await Promise.all([
    getCategories(),
    getRegions(listing.country_code),
    getCountries(),
    getAreas(listing.region_id),
    supabase.from("promotion_packages").select("id, name, description, days, price_minor, currency").eq("country_code", listing.country_code).eq("is_active", true).order("sort_order"),
    supabase.rpc("active_listing_limit", { p_user: user.id, p_country: listing.country_code }),
    supabase.rpc("active_listing_count", { p_user: user.id }),
  ]);
  const country = countries.find((c) => c.code === listing.country_code)!;
  const { data: buyers } = await supabase.from("conversations").select("buyer_id, buyer:profiles!conversations_buyer_id_fkey(display_name)").eq("listing_id", id);
  const imgs = [...listing.images].sort((a, b) => a.position - b.position).map((i) => ({ path: i.storage_path, url: i.url }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Edit listing</h1>
        <ListingActions listing={listing} buyers={(buyers ?? []).map((b) => ({ id: b.buyer_id, name: b.buyer?.display_name ?? "Buyer" }))} />
      </div>
      {listing.moderation_status !== "approved" && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <strong>Moderation: </strong>{listing.moderation_status.replace("_", " ")}{listing.moderation_note ? ` — ${listing.moderation_note}` : ""}
        </p>
      )}
      <ListingForm userId={user.id} listing={listing} images={imgs} categories={categories} regions={regions} currency={country.currency_code}
        regionLabel={country.region_label} areaLabel={country.area_label} initialAreas={areas}
        packages={getProvider(country.payment_provider) ? (packages ?? []) : []} allowance={limit != null && active != null ? { active, limit } : undefined}
        sellerDefaults={{ regionId: seller.region_id, city: seller.city, deliveryOptions: seller.delivery_options }} />
    </div>
  );
}
