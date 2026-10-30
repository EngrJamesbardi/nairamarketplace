import { randomUUID } from "node:crypto";
import { requireSeller } from "@/lib/auth";
import { getAreas, getCategories, getCountries, getRegions } from "@/lib/market";
import { getProvider } from "@/lib/payments";
import { ListingForm } from "@/components/ListingForm";

export const metadata = { title: "New listing" };

export default async function NewListing() {
  const { supabase, user, seller } = await requireSeller("/dashboard/listings/new");
  const [categories, regions, countries, areas, { data: packages }, { data: limit }, { data: active }] = await Promise.all([
    getCategories(),
    getRegions(seller.country_code),
    getCountries(),
    getAreas(seller.region_id),
    supabase.from("promotion_packages").select("id, name, description, days, price_minor, currency").eq("country_code", seller.country_code).eq("is_active", true).order("sort_order"),
    supabase.rpc("active_listing_limit", { p_user: user.id, p_country: seller.country_code }),
    supabase.rpc("active_listing_count", { p_user: user.id }),
  ]);
  const country = countries.find((c) => c.code === seller.country_code)!;
  // Paid promotion is offered only where the market has a working payment provider.
  const offerPromotion = !!getProvider(country.payment_provider);
  return (
    <div>
      <h1 className="h1 mb-1">New listing</h1>
      <p className="mb-6 text-sm text-muted">Listing is free. Prices are shown in {country.currency_code} for buyers in {country.name}.</p>
      <ListingForm userId={user.id} categories={categories} regions={regions} currency={country.currency_code} regionLabel={country.region_label}
        areaLabel={country.area_label} initialAreas={areas}
        sellerDefaults={{ regionId: seller.region_id, city: seller.city, deliveryOptions: seller.delivery_options }} requestId={randomUUID()}
        packages={offerPromotion ? (packages ?? []) : []} allowance={limit != null && active != null ? { active, limit } : undefined} />
    </div>
  );
}
