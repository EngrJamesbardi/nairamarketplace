import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { PromotionForm, CancelPromotion } from "./forms";

export const metadata = { title: "Promotions" };

const PLACEMENT: Record<string, string> = { search: "Top of search results", homepage: "Homepage", category: "Category pages" };

export default async function Promotions() {
  const { supabase, user, seller } = await requireSeller("/dashboard/promotions");
  const [{ data: balance }, { data: prices }, { data: listings }, { data: campaigns }] = await Promise.all([
    supabase.rpc("my_credit_balance"),
    supabase.from("promotion_prices").select("placement, credits_per_day").eq("country_code", seller.country_code),
    supabase.from("listings").select("id, title").eq("seller_id", user.id).eq("status", "active").eq("moderation_status", "approved").order("published_at", { ascending: false }),
    supabase.from("promotion_campaigns").select("*, listing:listings(title)").eq("seller_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const now = Date.now();
  return (
    <div className="space-y-6">
      <h1 className="h1">Promotions</h1>
      <p className="text-sm text-muted">
        Promote a listing to show it in a labelled &ldquo;Sponsored&rdquo; slot. You pay a fixed number of credits per day, whatever the number
        of views. Impressions and clicks below are real, de-duplicated counts (one per visitor per day), and your own views are excluded.
        Sponsored slots are limited per page and never replace normal results.
      </p>
      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">New promotion</h2>
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
                      {PLACEMENT[c.placement]} · {c.days} day{c.days > 1 ? "s" : ""} · {c.credits_charged} credits
                      {c.credits_refunded > 0 && ` (${c.credits_refunded} refunded)`} · {live ? `ends ${new Date(c.ends_at).toLocaleString("en-GB")}` : c.status}
                    </p>
                    {c.status_note && <p className="text-xs text-muted">{c.status_note}</p>}
                  </div>
                  <dl className="flex gap-4 text-center">
                    <div><dt className="text-xs text-muted">Impressions</dt><dd className="font-bold" data-testid="impressions">{c.impressions}</dd></div>
                    <div><dt className="text-xs text-muted">Clicks</dt><dd className="font-bold" data-testid="clicks">{c.clicks}</dd></div>
                    <div><dt className="text-xs text-muted">CTR</dt><dd className="font-bold">{ctr}</dd></div>
                  </dl>
                  <CancelPromotion id={c.id} live={live} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
