import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ProductCard, ProductGrid, EmptyState, type ListingCard } from "@/components/ProductCard";

export const metadata = { title: "Saved items" };

export default async function Favourites() {
  const { supabase, user } = await requireUser("/favourites");
  const { data: favs } = await supabase.from("favourites").select("listing_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
  const ids = (favs ?? []).map((f) => f.listing_id);
  const { data } = ids.length ? await supabase.from("listing_cards").select("*").in("id", ids) : { data: [] as ListingCard[] };
  const byId = new Map((data ?? []).map((l) => [l.id, l]));
  const items = ids.map((id) => byId.get(id)).filter(Boolean) as ListingCard[];
  return (
    <div className="page">
      <h1 className="h1 mb-4">Saved items</h1>
      {items.length === 0 ? <EmptyState title="Nothing saved yet" body="Tap the heart on any listing to save it here." action={<Link href="/" className="btn-primary mt-2">Browse</Link>} /> : (
        <ProductGrid>{items.map((l) => <ProductCard key={l.id} item={l} favourited />)}</ProductGrid>
      )}
    </div>
  );
}
