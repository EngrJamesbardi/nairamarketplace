import Link from "next/link";
import { requireSeller } from "@/lib/auth";

export const metadata = { title: "Seller dashboard" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { supabase, user, seller } = await requireSeller();
  const [{ data: listings }, { count: followers }, { count: pendingOffers }, { data: limit }, { data: rating }] = await Promise.all([
    supabase.from("listings").select("id, title, status, view_count, favourite_count, message_count").eq("seller_id", user.id),
    supabase.from("seller_follows").select("follower_id", { count: "exact", head: true }).eq("seller_id", user.id),
    supabase.from("offers").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "pending").neq("proposed_by", user.id),
    supabase.rpc("active_listing_limit", { p_user: user.id, p_country: seller.country_code }),
    supabase.from("seller_ratings").select("*").eq("seller_id", user.id).maybeSingle(),
  ]);
  const all = listings ?? [];
  const active = all.filter((l) => l.status === "active").length;
  const sum = (k: "view_count" | "favourite_count" | "message_count") => all.reduce((a, l) => a + l[k], 0);
  const top = [...all].sort((a, b) => b.view_count - a.view_count).slice(0, 5);

  const stats = [
    { label: "Active listings", value: `${active}${limit != null ? ` / ${limit}` : ""}`, hint: "Free allowance" },
    { label: "Listing views", value: sum("view_count"), hint: "Unique viewers per day" },
    { label: "Saves", value: sum("favourite_count") },
    { label: "Enquiries", value: sum("message_count"), hint: "Conversations started" },
    { label: "Offers awaiting you", value: pendingOffers ?? 0, href: "/dashboard/offers" },
    { label: "Followers", value: followers ?? 0 },
  ];

  return (
    <div className="space-y-6">
      {welcome && (
        <div className="rounded-2xl bg-cream p-5">
          <p className="text-lg font-bold">Your storefront is live 🎉</p>
          <p className="text-sm text-muted">Post your first listing. It&apos;s free.</p>
          <Link href="/dashboard/listings/new" className="btn-primary mt-3">Post a listing</Link>
        </div>
      )}
      <h1 className="h1">Overview</h1>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => (
          <li key={s.label} className="card p-4">
            <p className="text-sm text-muted">{s.label}</p>
            <p className="text-2xl font-bold">{s.href ? <Link href={s.href} className="hover:text-brand">{s.value}</Link> : s.value}</p>
            {s.hint && <p className="text-xs text-muted">{s.hint}</p>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">All figures are counted from real activity on Naira Marketplace. Views are de-duplicated per visitor per day and exclude your own visits.</p>
      <section className="card p-5">
        <h2 className="h2 mb-3">Listing performance</h2>
        {top.length === 0 ? <p className="text-sm text-muted">No listings yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Listing</th><th className="font-medium">Views</th><th className="font-medium">Saves</th><th className="font-medium">Enquiries</th></tr></thead>
            <tbody>
              {top.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="py-2 pr-2"><Link href={`/listing/${l.id}`} className="hover:text-brand">{l.title}</Link></td>
                  <td>{l.view_count}</td><td>{l.favourite_count}</td><td>{l.message_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card p-5 text-sm">
        <h2 className="h2 mb-1">Reputation</h2>
        {rating?.review_count ? <p>★ {rating.avg_rating} from {rating.review_count} reviews ({rating.verified_count} on confirmed sales)</p> : <p className="text-muted">No reviews yet. Buyers can review you after you accept their offer or mark an item sold to them.</p>}
      </section>
    </div>
  );
}
