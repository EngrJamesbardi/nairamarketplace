import { requireUser } from "@/lib/auth";
import { getCountries, getSelectedCountry } from "@/lib/market";
import { createClient } from "@/lib/supabase/server";
import { SellerForm } from "./form";

export const metadata = { title: "Set up your storefront" };

export default async function SellerOnboarding({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { user, seller, profile } = await requireUser("/onboarding/seller");
  const [countries, selected, supabase] = await Promise.all([getCountries(), getSelectedCountry(), createClient()]);
  const { data: regions } = await supabase.from("regions").select("id, name, country_code").eq("is_active", true).order("name");
  const { next } = await searchParams;
  return (
    <div className="page max-w-3xl">
      <h1 className="h1">{seller ? "Storefront settings" : "Set up your storefront"}</h1>
      <p className="mb-6 mt-1 text-muted">You buy and sell with the same account. This creates your public shop page.</p>
      <SellerForm userId={user.id} seller={seller} countries={countries} regions={regions ?? []} defaultCountry={profile?.country_code ?? selected.code} next={next} />
    </div>
  );
}
