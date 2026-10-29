import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PriceTag } from "@/components/ProductCard";
import { Op, Flash, small, smallPrimary, smallDanger } from "../ui";

type SP = { tab?: string; ok?: string; error?: string; q?: string };

export default async function ModerationQueue({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? "pending";
  const { supabase } = await requireAdmin();
  let q = supabase.from("listings").select("id, title, description, status, moderation_status, moderation_note, price_minor, currency, price_type, country_code, created_at, seller_id, is_seed, seller:seller_profiles!listings_seller_shop_fkey(shop_name, slug)").order("created_at", { ascending: false }).limit(100);
  if (tab === "pending") q = q.eq("moderation_status", "pending_review");
  else if (tab === "removed") q = q.in("moderation_status", ["rejected", "removed"]);
  if (sp.q) q = q.ilike("title", `%${sp.q}%`);
  const { data: listings, error } = await q;
  const back = `/admin/listings?tab=${tab}`;
  return (
    <>
      <h1 className="h1">Listing moderation</h1>
      <Flash sp={sp} />
      <nav className="flex flex-wrap gap-2">
        {[["pending", "Awaiting review"], ["all", "All recent"], ["removed", "Removed / rejected"]].map(([k, l]) => (
          <Link key={k} href={`/admin/listings?tab=${k}`} className={`chip ${tab === k ? "chip-active" : ""}`}>{l}</Link>
        ))}
        <form className="ml-auto"><input type="hidden" name="tab" value={tab} /><input name="q" defaultValue={sp.q} placeholder="Search title" className="input min-h-9 py-1" aria-label="Search listings" /></form>
      </nav>
      {error && <p className="text-danger">{error.message}</p>}
      {!listings?.length ? <p className="card p-6 text-center text-muted">Nothing here. 🎉</p> : (
        <ul className="space-y-3">
          {listings.map((l) => (
            <li key={l.id} className="card space-y-2 p-4" data-testid="moderation-item">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/listing/${l.id}`} className="font-semibold hover:text-brand">{l.title}</Link>
                <span className="badge bg-cream text-brand-strong">{l.status}</span>
                <span className={`badge ${l.moderation_status === "approved" ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}`}>{l.moderation_status}</span>
                <span className="text-xs text-muted">{l.country_code} · {l.seller?.shop_name} · {new Date(l.created_at).toLocaleString("en-GB")}</span>
                {l.is_seed && <span className="badge bg-ink/80 text-canvas">Demo</span>}
              </div>
              <PriceTag priceMinor={l.price_minor} currency={l.currency} priceType={l.price_type} country={l.country_code} className="text-sm" />
              <p className="line-clamp-2 text-sm text-muted">{l.description}</p>
              {l.moderation_note && <p className="text-xs text-warning">Note: {l.moderation_note}</p>}
              <Op op="listing.moderate" back={back}>
                <input type="hidden" name="id" value={l.id} />
                <input name="reason" placeholder="Reason (shown to seller)" className="input min-h-9 max-w-xs py-1 text-xs" aria-label="Reason" />
                {l.moderation_status !== "approved" && <button name="action" value={l.moderation_status === "pending_review" ? "approve" : "restore"} className={smallPrimary}>{l.moderation_status === "pending_review" ? "Approve" : "Restore"}</button>}
                {l.moderation_status === "pending_review" && <button name="action" value="reject" className={small}>Reject</button>}
                {l.moderation_status !== "removed" && <button name="action" value="remove" className={smallDanger}>Remove</button>}
              </Op>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
