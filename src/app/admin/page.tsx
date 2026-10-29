import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_stats");
  const s = (data ?? {}) as Record<string, number | Record<string, number>>;
  const tiles: [string, string, string?][] = [
    ["Members", "users"], ["New members (7d)", "users_7d"], ["Sellers", "sellers"], ["Active listings", "active_listings"],
    ["New listings (7d)", "listings_7d"], ["Awaiting review", "pending_review", "/admin/listings"], ["Open reports", "open_reports", "/admin/reports"],
    ["Pending verifications", "pending_verifications", "/admin/verifications"], ["Conversations (7d)", "conversations_7d"], ["Messages (7d)", "messages_7d"],
    ["Offers (7d)", "offers_7d"], ["Accepted offers (7d)", "accepted_offers_7d"],
  ];
  return (
    <>
      <h1 className="h1">Platform overview</h1>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, key, href]) => (
          <li key={key} className="card p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="text-2xl font-bold">{href ? <Link href={href} className="hover:text-brand">{String(s[key] ?? 0)}</Link> : String(s[key] ?? 0)}</p>
          </li>
        ))}
      </ul>
      <section className="card p-4">
        <h2 className="h2 mb-2">Active listings by country</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {Object.entries((s.by_country as Record<string, number>) ?? {}).map(([c, n]) => <li key={c} className="chip">{c}: {n}</li>)}
        </ul>
      </section>
      <p className="text-xs text-muted">All figures are computed live from the database. Engagement metrics count real activity only.</p>
    </>
  );
}
