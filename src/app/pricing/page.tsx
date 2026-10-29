import Link from "next/link";
import { Check } from "lucide-react";
import { getSelectedCountry } from "@/lib/market";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Pricing", description: "Free to browse, list, message and sell. Optional paid extras for sellers." };

export default async function Pricing() {
  const country = await getSelectedCountry();
  const supabase = await createClient();
  const [{ data: packages }, { data: plans }, { data: prices }] = await Promise.all([
    supabase.from("credit_packages").select("*").eq("country_code", country.code).eq("is_active", true).order("sort_order"),
    supabase.from("subscription_plans").select("*").eq("country_code", country.code).eq("is_active", true).order("sort_order"),
    supabase.from("promotion_prices").select("*").eq("country_code", country.code),
  ]);
  const label: Record<string, string> = { search: "Top of search results", homepage: "Homepage", category: "Category pages" };
  return (
    <div className="page max-w-4xl space-y-8">
      <header className="space-y-2">
        <h1 className="h1">Simple, optional pricing</h1>
        <p className="text-muted">Prices for {country.name} in {country.currency_code}.</p>
      </header>
      <section className="card space-y-2 p-5">
        <h2 className="h2">Free for everyone</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {["Browse and search", "Message sellers and make offers", `List up to ${country.free_active_listing_limit} items at a time`, "Your own storefront", "No commission on sales, ever", "You agree payment and delivery directly"].map((f) => (
            <li key={f} className="flex gap-2"><Check className="size-4 shrink-0 text-success" aria-hidden />{f}</li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="h2">Promote your listings (optional)</h2>
        <p className="text-sm text-muted">Buy credits and spend them to show a listing in a clearly labelled &ldquo;Sponsored&rdquo; slot. Fixed price per day; you are never charged per view or click.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card p-4">
            <h3 className="font-semibold">Credit packages</h3>
            {!packages?.length ? <p className="text-sm text-muted">Not available in this market yet.</p> : (
              <ul className="mt-2 space-y-1 text-sm">{packages.map((p) => <li key={p.id} className="flex justify-between"><span>{p.name} · {p.credits} credits</span><strong>{formatMoney(p.price_minor, p.currency)}</strong></li>)}</ul>
            )}
          </div>
          <div className="card p-4">
            <h3 className="font-semibold">Placements</h3>
            <ul className="mt-2 space-y-1 text-sm">{(prices ?? []).map((p) => <li key={p.placement} className="flex justify-between"><span>{label[p.placement]}</span><strong>{p.credits_per_day} credits/day</strong></li>)}</ul>
          </div>
        </div>
      </section>
      {(plans?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="h2">Plans for high-volume sellers (optional)</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {plans!.map((p) => (
              <li key={p.id} className="card p-4">
                <p className="font-semibold">{p.name}</p>
                <p className="text-xl font-bold">{formatMoney(p.price_minor, p.currency)} <span className="text-sm font-normal text-muted">/ {p.period_days} days</span></p>
                <p className="text-sm text-muted">{p.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted">Prices shown are set by Naira Marketplace administrators and may change; the price at checkout applies. Paid services are for promotion and listing capacity only. We do not process payments for goods between members.</p>
      <Link href="/dashboard/credits" className="btn-primary">Go to my credits</Link>
    </div>
  );
}
