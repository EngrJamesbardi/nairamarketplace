import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getProvider } from "@/lib/payments";
import { PromotionForm, CancelPromotion } from "./forms";

export const metadata = { title: "Promotions" };

const PLACEMENT: Record<string, string> = { search: "Top of search results", homepage: "Homepage", category: "Category pages" };

export default async function Promotions({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, seller } = await requireSeller("/dashboard/promotions");
  const [{ data: balance }, { data: prices }, { data: listings }, { data: campaigns }, { data: packages }, { data: country }] = await Promise.all([
    supabase.rpc("my_credit_balance"),
    supabase.from("promotion_prices").select("placement, credits_per_day").eq("country_code", seller.country_code),
    supabase.from("listings").select("id, title").eq("seller_id", user.id).eq("status", "active").eq("moderation_status", "approved").order("published_at", { ascending: false }),
    supabase.from("promotion_campaigns").select("*, listing:listings(title), package:promotion_packages(name, price_minor, currency)").eq("seller_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("promotion_packages").select("id, name, description, days, price_minor, currency").eq("country_code", seller.country_code).eq("is_active", true).order("sort_order"),
    supabase.from("countries").select("name, payment_provider").eq("code", seller.country_code).single(),
  ]);
  const provider = getProvider(country?.payment_provider);
  const now = Date.now();
  return (
    <div className="space-y-6">
      <h1 className="h1">Promotions</h1>
      {sp.error && <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">{sp.error}</p>}
      {(packages?.length ?? 0) > 0 && (
        <section className="card space-y-3 p-5" data-testid="promotion-packages">
          <h2 className="h2">Promote a listing</h2>
          <p className="text-sm text-muted">
            A promotion shows your listing in labelled &ldquo;Sponsored&rdquo; slots on the homepage, at the top of matching searches and in its
            category for the whole period, so more buyers see it. It starts when your payment is confirmed and ends automatically.
          </p>
          {provider?.key === "mock" && <p className="rounded-lg border border-warning bg-warning/10 px-3 py-2 text-xs font-semibold text-ink">Payments in this environment use a development mock. No real money is taken.</p>}
          {!provider ? (
            <p className="text-sm text-muted">Paid promotions are not available in {country?.name} yet.</p>
          ) : !listings?.length ? (
            <p className="text-sm text-muted">You need an active, approved listing to promote. <Link className="link" href="/dashboard/listings/new">Post one</Link>.</p>
          ) : (
            <form action="/pay/start" method="post" className="space-y-3">
              <input type="hidden" name="purpose" value="promotion" />
              <input type="hidden" name="back" value="/dashboard/promotions" />
              <div>
                <label className="label" htmlFor="promo-listing">Listing</label>
                <select id="promo-listing" name="listing" className="input" required defaultValue={sp.saved ?? undefined}>
                  {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="label">Package</legend>
                {packages!.map((p, i) => (
                  <label key={p.id} className="flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-cream">
                    <span className="flex items-center gap-2 font-semibold"><input type="radio" name="item" value={p.id} defaultChecked={i === 0} required className="accent-[var(--brand)]" /> {p.name}</span>
                    <span className="text-lg font-extrabold text-brand-strong">{formatMoney(p.price_minor, p.currency)}</span>
                    {p.description && <span className="text-xs text-muted">{p.description}</span>}
                  </label>
                ))}
              </fieldset>
              <button className="btn-primary">Continue to payment</button>
            </form>
          )}
        </section>
      )}
      <p className="text-sm text-muted">
        Promote a listing to show it in a labelled &ldquo;Sponsored&rdquo; slot. You pay a fixed number of credits per day, whatever the number
        of views. Impressions and clicks below are real, de-duplicated counts (one per visitor per day), and your own views are excluded.
        Sponsored slots are limited per page and never replace normal results.
      </p>
      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">Promote with credits</h2>
          <p className="text-sm">Balance: <strong data-testid="promo-balance">{balance ?? 0} credits</strong> · <Link className="link" href="/dashboard/credits">Buy credits</Link></p>
        </div>
        {!listings?.length ? (
          <p className="text-sm text-muted">You need an active, approved listing to promote. <Link className="link" href="/dashboard/listings/new">Post one</Link>.</p>
        ) : (
          <PromotionForm listings={listings} prices={(prices ?? []).map((p) => ({ ...p, label: PLACEMENT[p.placement] }))} />
        )}
      </section>
      <section className="space-y-2">
        <h2 className="h2">Your promotions</h2>
        {!campaigns?.length ? <p className="card p-4 text-sm text-muted">No promotions yet.</p> : (
          <ul className="space-y-2">
            {campaigns.map((c) => {
              const live = (c.status === "active" || c.status === "paused") && new Date(c.ends_at).getTime() > now;
              const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) + "%" : "—";
              return (
                <li key={c.id} className="card flex flex-wrap items-center gap-3 p-4 text-sm" data-testid="campaign">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.listing?.title}</p>
                    <p className="text-muted">
                      {PLACEMENT[c.placement]} · {c.days} day{c.days > 1 ? "s" : ""} ·{" "}
                      {c.payment_id ? <>Paid{c.package ? ` (${c.package.name}, ${formatMoney(c.package.price_minor, c.package.currency)})` : ""}</> : <>{c.credits_charged} credits{c.credits_refunded > 0 && ` (${c.credits_refunded} refunded)`}</>}
                      {" "}· <span data-testid="promo-status">{live ? `${c.status === "paused" ? "paused, " : "active, "}ends ${new Date(c.ends_at).toLocaleString("en-GB")}` : `${c.status === "active" ? "ended" : c.status} ${new Date(c.ends_at).toLocaleDateString("en-GB")}`}</span>
                    </p>
                    {c.status_note && <p className="text-xs text-muted">{c.status_note}</p>}
                  </div>
                  <dl className="flex gap-4 text-center">
                    <div><dt className="text-xs text-muted">Impressions</dt><dd className="font-bold" data-testid="impressions">{c.impressions}</dd></div>
                    <div><dt className="text-xs text-muted">Clicks</dt><dd className="font-bold" data-testid="clicks">{c.clicks}</dd></div>
                    <div><dt className="text-xs text-muted">CTR</dt><dd className="font-bold">{ctr}</dd></div>
                  </dl>
                  {!c.payment_id && <CancelPromotion id={c.id} live={live} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
