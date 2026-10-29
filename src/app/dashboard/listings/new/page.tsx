import { randomUUID } from "node:crypto";
import { requireSeller } from "@/lib/auth";
import { getCategories, getCountries, getRegions } from "@/lib/market";
import { ListingForm } from "@/components/ListingForm";

export const metadata = { title: "New listing" };

export default async function NewListing() {
  const { user, seller } = await requireSeller("/dashboard/listings/new");
  const [categories, regions, countries] = await Promise.all([getCategories(), getRegions(seller.country_code), getCountries()]);
  const country = countries.find((c) => c.code === seller.country_code)!;
  return (
    <div>
      <h1 className="h1 mb-1">New listing</h1>
      <p className="mb-6 text-sm text-muted">Listing is free. Prices are shown in {country.currency_code} for buyers in {country.name}.</p>
      <ListingForm userId={user.id} categories={categories} regions={regions} currency={country.currency_code} regionLabel={country.region_label}
        sellerDefaults={{ regionId: seller.region_id, city: seller.city, deliveryOptions: seller.delivery_options }} requestId={randomUUID()} />
    </div>
  );
}
