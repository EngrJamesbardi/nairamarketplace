import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { EmptyState } from "@/components/ProductCard";

export const metadata = { title: "Offers" };

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "received" } = await searchParams;
  const { supabase, user } = await requireSeller();
  let q = supabase.from("offers").select("*, listing:listings(title, country_code), buyer:profiles!offers_buyer_id_fkey(display_name)").order("created_at", { ascending: false }).limit(100);
  q = tab === "made" ? q.eq("buyer_id", user.id) : q.eq("seller_id", user.id);
  const { data: offers } = await q;
  return (
    <div className="space-y-4">
      <h1 className="h1">Offers</h1>
      <nav className="flex gap-2" aria-label="Offer type">
        <Link href="/dashboard/offers" className={`chip ${tab !== "made" ? "chip-active" : ""}`}>Received on my listings</Link>
        <Link href="/dashboard/offers?tab=made" className={`chip ${tab === "made" ? "chip-active" : ""}`}>Made by me</Link>
      </nav>
      <p className="text-xs text-muted">An accepted offer is an agreed price only. Payment and delivery are arranged directly between you and the other party.</p>
      {!offers?.length ? <EmptyState title="No offers yet" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Listing</th><th className="font-medium">{tab === "made" ? "Seller" : "Buyer"}</th><th className="font-medium">Amount</th><th className="font-medium">Status</th><th className="font-medium">Date</th><th /></tr></thead>
            <tbody>
              {offers.map((o) => {
                const expired = o.status === "pending" && new Date(o.expires_at) <= new Date();
                return (
                  <tr key={o.id} className="border-t border-line">
                    <td className="p-3">{o.listing?.title}</td>
                    <td>{tab === "made" ? "—" : o.buyer?.display_name}</td>
                    <td className="font-semibold">{formatMoney(o.amount_minor, o.currency, `en-${o.listing?.country_code ?? "NG"}`)}</td>
                    <td><span className="badge bg-cream text-brand-strong">{expired ? "expired" : o.status}</span>{o.parent_offer_id && <span className="ml-1 text-xs text-muted">(counter)</span>}</td>
                    <td className="text-muted">{new Date(o.created_at).toLocaleDateString("en-GB")}</td>
                    <td className="pr-3"><Link className="link" href={`/messages/${o.conversation_id}`}>Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
