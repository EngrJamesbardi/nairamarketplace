import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Op, Flash, small, smallDanger } from "../ui";

export default async function Campaigns({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; all?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  let q = supabase.from("promotion_campaigns").select("*, listing:listings(id, title), seller:seller_profiles!promotion_campaigns_seller_shop_fkey(shop_name, slug)").order("created_at", { ascending: false }).limit(100);
  if (!sp.all) q = q.in("status", ["active", "paused"]);
  const { data, error } = await q;
  const back = `/admin/campaigns${sp.all ? "?all=1" : ""}`;
  return (
    <>
      <h1 className="h1">Promotion campaigns</h1>
      <Flash sp={sp} />
      {error && <p className="text-danger">{error.message}</p>}
      <p className="text-sm"><Link className="link" href={sp.all ? "/admin/campaigns" : "/admin/campaigns?all=1"}>{sp.all ? "Show running only" : "Show all"}</Link></p>
      <p className="text-sm text-muted">Remove a promotion that breaks the rules: the seller is refunded for whole unused days and notified.</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Listing</th><th className="font-medium">Shop</th><th className="font-medium">Placement</th><th className="font-medium">Ends</th><th className="font-medium">Imp / clicks</th><th className="font-medium">Status</th><th /></tr></thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id} className="border-t border-line align-top">
                <td className="p-3"><Link className="link" href={`/listing/${c.listing?.id}`}>{c.listing?.title}</Link></td>
                <td className="py-3">{c.seller?.shop_name}</td>
                <td className="py-3">{c.placement} · {c.country_code}</td>
                <td className="py-3">{new Date(c.ends_at).toLocaleString("en-GB")}</td>
                <td className="py-3">{c.impressions} / {c.clicks}</td>
                <td className="py-3">{c.status}</td>
                <td className="space-y-1 py-3 pr-3">
                  {(c.status === "active" || c.status === "paused") && (
                    <Op op="campaign.status" back={back}>
                      <input type="hidden" name="id" value={c.id} />
                      <input name="note" placeholder="Reason" className="input min-h-9 w-28 py-1 text-xs" aria-label="Reason" />
                      {c.status === "active" ? <button name="status" value="paused" className={small}>Pause</button> : <button name="status" value="active" className={small}>Resume</button>}
                      <button name="status" value="removed" className={smallDanger}>Remove & refund</button>
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
