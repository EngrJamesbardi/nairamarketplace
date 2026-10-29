import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EmptyState } from "@/components/ProductCard";

export const metadata = { title: "Following" };

export default async function Following() {
  const { supabase, user } = await requireUser("/following");
  const { data } = await supabase.from("seller_follows").select("seller:seller_profiles(shop_name, slug, city, logo_url)").eq("follower_id", user.id).order("created_at", { ascending: false });
  return (
    <div className="page max-w-3xl">
      <h1 className="h1 mb-4">Shops you follow</h1>
      {!data?.length ? <EmptyState title="You're not following any shops" body="Follow a shop to get notified when it lists something new." /> : (
        <ul className="card divide-y divide-line">
          {data.map((f) => f.seller && (
            <li key={f.seller.slug}><Link href={`/s/${f.seller.slug}`} className="flex items-center justify-between p-3 hover:bg-cream/50"><span className="font-medium">{f.seller.shop_name}</span><span className="text-sm text-muted">{f.seller.city}</span></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
