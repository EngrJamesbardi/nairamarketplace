import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Op, Flash, small, smallDanger } from "../ui";

const VIEWS = [["running", "Running"], ["expired", "Ended & expired"], ["all", "All"]] as const;

export default async function Campaigns({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; view?: string; all?: string }> }) {
  const sp = await searchParams;
  const view = sp.all ? "all" : (VIEWS.find(([v]) => v === sp.view)?.[0] ?? "running");
  const { supabase } = await requireAdmin();
  const now = new Date().toISOString();
  let q = supabase.from("promotion_campaigns")
    .select("*, listing:listings(id, title), seller:seller_profiles!promotion_campaigns_seller_shop_fkey(shop_name, slug), package:promotion_packages(name, price_minor, currency)")
    .order("created_at", { ascending: false }).limit(200);
  // "Running" means live right now; a campaign past its end date counts as expired even before the maintenance job marks it.
  if (view === "running") q = q.in("status", ["active", "paused"]).gt("ends_at", now);
  if (view === "expired") q = q.or(`status.in.(ended,cancelled,removed),ends_at.lte.${now}`);
  const { data, error } = await q;
  const back = `/admin/campaigns?view=${view}`;
  return (
    <>
      <h1 className="h1">Promotion campaigns</h1>
      <Flash sp={sp} />
      {error && <p className="text-danger">{error.message}</p>}
      <nav className="flex flex-wrap gap-2" aria-label="Filter promotions">
        {VIEWS.map(([v, l]) => <Link key={v} href={`/admin/campaigns?view=${v}`} className={`chip ${view === v ? "chip-active" : ""}`}>{l}</Link>)}
      </nav>
      <p className="text-sm text-muted">
        Remove a promotion that breaks the rules; the seller is notified. Credit-funded promotions are refunded for whole unused days. Paid
        packages were paid for with money: removing one does not refund it automatically, so refund through the payment provider if
        appropriate. Prices and durations are set under <Link className="link" href="/admin/promotions">Promotion packages</Link>.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[840px] text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Listing</th><th className="font-medium">Shop</th><th className="font-medium">Placement</th><th className="font-medium">Funding</th><th className="font-medium">Ends</th><th className="font-medium">Imp / clicks</th><th className="font-medium">Status</th><th /></tr></thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id} className="border-t border-line align-top">
                <td className="p-3"><Link className="link" href={`/listing/${c.listing?.id}`}>{c.listing?.title}</Link></td>
                <td className="py-3">{c.seller?.shop_name}</td>
                <td className="py-3">{c.placement} · {c.country_code}</td>
                <td className="py-3">{c.payment_id ? <>Paid{c.package ? `: ${c.package.name} (${formatMoney(c.package.price_minor, c.package.currency)})` : ""}</> : `${c.credits_charged} credits`}</td>
                <td className="py-3">{new Date(c.ends_at).toLocaleString("en-GB")}{c.status === "active" && c.ends_at <= now ? " (expired)" : ""}</td>
                <td className="py-3">{c.impressions} / {c.clicks}</td>
                <td className="py-3">{c.status}</td>
                <td className="space-y-1 py-3 pr-3">
                  {(c.status === "active" || c.status === "paused") && c.ends_at > now && (
                    <Op op="campaign.status" back={back}>
                      <input type="hidden" name="id" value={c.id} />
                      <input name="note" placeholder="Reason" className="input min-h-9 w-28 py-1 text-xs" aria-label="Reason" />
                      {c.status === "active" ? <button name="status" value="paused" className={small}>Pause</button> : <button name="status" value="active" className={small}>Resume</button>}
                      <button name="status" value="removed" className={smallDanger}>{c.payment_id ? "Remove" : "Remove & refund"}</button>
                    </Op>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
