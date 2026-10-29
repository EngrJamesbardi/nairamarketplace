import { Check } from "lucide-react";
import { requireSeller } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getProvider } from "@/lib/payments";

export const metadata = { title: "Seller plan" };

export default async function Plan({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, seller } = await requireSeller("/dashboard/plan");
  const [{ data: plans }, { data: sub }, { data: limit }, { data: country }, { count: active }] = await Promise.all([
    supabase.from("subscription_plans").select("*").eq("country_code", seller.country_code).eq("is_active", true).order("sort_order"),
    supabase.from("subscriptions").select("*, plan:subscription_plans(name, code)").eq("user_id", user.id).eq("status", "active").maybeSingle(),
    supabase.rpc("active_listing_limit", { p_user: user.id, p_country: seller.country_code }),
    supabase.from("countries").select("name, payment_provider, free_active_listing_limit").eq("code", seller.country_code).single(),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "active"),
  ]);
  const provider = getProvider(country?.payment_provider);
  const current = sub && new Date(sub.current_period_end) > new Date() ? sub : null;
  return (
    <div className="space-y-6">
      <h1 className="h1">Seller plan</h1>
      {sp.error && <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">{sp.error}</p>}
      <section className="rounded-2xl bg-cream p-5" data-testid="current-plan">
        <p className="text-sm text-muted">Current plan</p>
        <p className="text-2xl font-extrabold">{current ? current.plan?.name : "Free"}</p>
        <p className="text-sm">
          {active ?? 0} of {limit ?? country?.free_active_listing_limit} active listings used.
          {current && <> Paid until {new Date(current.current_period_end).toLocaleDateString("en-GB")}.</>}
        </p>
      </section>
      <p className="text-sm text-muted">
        The free plan lets you keep {country?.free_active_listing_limit} listings active at a time, with every marketplace feature included. Paid
        plans are for high-volume sellers who need more active listings, and include promotion credits each period. Plans do not renew
        automatically: renew before the end date to keep the higher allowance. If a plan ends, your listings stay up but you can&apos;t
        activate more than the free allowance.
      </p>
      {provider?.key === "mock" && <p className="text-xs font-semibold text-warning">Payments in this environment use a development mock. No real money is taken.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {(plans ?? []).map((p) => {
          const isCurrent = current?.plan_id === p.id;
          return (
            <li key={p.id} className={`card flex flex-col gap-2 p-5 ${isCurrent ? "ring-2 ring-brand" : ""}`}>
              <p className="text-lg font-bold">{p.name}</p>
              <p className="text-2xl font-extrabold">{formatMoney(p.price_minor, p.currency)} <span className="text-sm font-normal text-muted">/ {p.period_days} days</span></p>
              <ul className="space-y-1 text-sm">
                <li className="flex gap-2"><Check className="size-4 text-success" aria-hidden /> Up to {p.active_listing_limit.toLocaleString("en")} active listings</li>
                {p.monthly_credits > 0 && <li className="flex gap-2"><Check className="size-4 text-success" aria-hidden /> {p.monthly_credits} promotion credits per period</li>}
                <li className="flex gap-2"><Check className="size-4 text-success" aria-hidden /> No commission on your sales</li>
              </ul>
              {provider ? (
                <form action="/pay/start" method="post" className="mt-auto">
                  <input type="hidden" name="purpose" value="subscription" />
                  <input type="hidden" name="item" value={p.id} />
                  <input type="hidden" name="back" value="/dashboard/plan" />
                  <button className={isCurrent ? "btn-secondary w-full" : "btn-primary w-full"}>{isCurrent ? "Renew for another period" : current ? `Switch to ${p.name}` : `Choose ${p.name}`}</button>
                </form>
              ) : (
                <p className="mt-auto text-sm text-muted">Paid plans are not available in {country?.name} yet.</p>
              )}
            </li>
          );
        })}
      </ul>
      {current && <p className="text-xs text-muted">Switching plan starts the new plan immediately; the remainder of the current period is not refunded.</p>}
    </div>
  );
}
