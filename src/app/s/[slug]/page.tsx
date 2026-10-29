import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, BadgeCheck, Clock, Truck, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { ProductCard, ProductGrid, EmptyState } from "@/components/ProductCard";
import { favouriteIds } from "@/lib/listings";
import { FollowButton } from "./follow";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { t } from "@/i18n";

type P = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const supabase = await createClient();
  const { data: seller } = await supabase.from("seller_profiles").select("*, region:regions(name), country:countries(name)").eq("slug", slug).maybeSingle();
  return { supabase, seller };
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { seller } = await load((await params).slug);
  if (!seller) return { title: "Shop not found" };
  return { title: seller.shop_name, description: seller.description?.slice(0, 160) ?? `${seller.shop_name} on Naira Marketplace`, robots: { index: !seller.is_seed } };
}

export default async function Storefront({ params }: P) {
  const { slug } = await params;
  const { supabase, seller } = await load(slug);
  if (!seller) notFound();
  const session = await getSession();
  const [{ data: listings }, { count: followers }, { data: rating }, { data: reviews }, follow] = await Promise.all([
    supabase.from("listing_cards").select("*").eq("seller_id", seller.user_id).in("status", ["active", "reserved"]).eq("moderation_status", "approved").order("published_at", { ascending: false }).limit(60),
    supabase.from("seller_follows").select("follower_id", { count: "exact", head: true }).eq("seller_id", seller.user_id),
    supabase.from("seller_ratings").select("*").eq("seller_id", seller.user_id).maybeSingle(),
    supabase.from("reviews").select("id, rating, body, verified_transaction, created_at, seller_reply, reviewer:profiles!reviews_reviewer_id_fkey(display_name)").eq("seller_id", seller.user_id).eq("status", "published").order("created_at", { ascending: false }).limit(10),
    session.user ? supabase.from("seller_follows").select("seller_id").eq("follower_id", session.user.id).eq("seller_id", seller.user_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const favs = await favouriteIds(session.user?.id, (listings ?? []).map((l) => l.id));
  const hours = (seller.business_hours as { text?: string } | null)?.text;
  const isOwner = session.user?.id === seller.user_id;

  return (
    <div>
      <section className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center">
          <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface text-3xl font-bold text-brand shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {seller.logo_url ? <img src={seller.logo_url} alt="" className="size-full object-cover" /> : seller.shop_name.slice(0, 1)}
          </span>
          <div className="flex-1 space-y-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
              {seller.shop_name}
              {seller.verification_status === "verified" && <span className="badge bg-success/10 text-success"><BadgeCheck className="size-4" aria-hidden /> Verified business</span>}
              {seller.is_seed && <span className="badge bg-ink/80 text-white">Demo</span>}
            </h1>
            <p className="text-sm text-muted">{t(`sellerType.${seller.seller_type}`)} · {followers ?? 0} follower{followers === 1 ? "" : "s"} · {rating?.review_count ? `★ ${rating.avg_rating} (${rating.review_count})` : "No reviews yet"}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1"><MapPin className="size-4 text-brand" aria-hidden />{[seller.city, seller.region?.name, seller.country?.name].filter(Boolean).join(", ")}</span>
              <span className="flex items-center gap-1"><CalendarDays className="size-4 text-brand" aria-hidden />Joined {new Date(seller.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
              {hours && <span className="flex items-center gap-1"><Clock className="size-4 text-brand" aria-hidden />{hours}</span>}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:w-56">
            {!isOwner && <FollowButton sellerId={seller.user_id} slug={seller.slug} initial={!!follow.data} signedIn={!!session.user} />}
            {seller.show_whatsapp && seller.whatsapp_number && <WhatsAppLink number={seller.whatsapp_number} text={`Hi ${seller.shop_name}, I found your shop on Naira Marketplace`} />}
          </div>
        </div>
      </section>
      <div className="page grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <h2 className="h2">Listings</h2>
          {listings?.length ? (
            <ProductGrid>{listings.map((l) => <ProductCard key={l.id} item={l} favourited={favs.has(l.id!)} />)}</ProductGrid>
          ) : <EmptyState title="No active listings" />}
        </div>
        <aside className="space-y-4">
          {seller.description && <section className="card p-4 text-sm"><h2 className="mb-1 font-bold">About</h2><p className="whitespace-pre-line">{seller.description}</p></section>}
          <section className="card p-4 text-sm">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><Truck className="size-4 text-brand" aria-hidden />Delivery & collection</h2>
            <ul className="space-y-1">{seller.delivery_options.map((d) => <li key={d}>• {t(`delivery.${d}`)}</li>)}</ul>
            {seller.delivery_notes && <p className="mt-2 text-muted">{seller.delivery_notes}</p>}
          </section>
          {seller.verification_status !== "verified" && <p className="text-xs text-muted">This seller has not been independently verified by Naira Marketplace.</p>}
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-bold">Reviews</h2>
            {reviews?.length ? (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="border-t border-line pt-2 first:border-0 first:pt-0">
                    <p className="font-medium">{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span> <span className="sr-only">{r.rating} out of 5</span></p>
                    <p className="text-xs text-muted">{r.reviewer?.display_name} · {r.verified_transaction ? "Seller confirmed this sale" : "Agreed price via an accepted offer (sale not confirmed)"}</p>
                    {r.body && <p className="mt-1">{r.body}</p>}
                    {r.seller_reply && <p className="mt-1 rounded bg-cream p-2 text-xs"><strong>Seller reply:</strong> {r.seller_reply}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted">No reviews yet.</p>}
            <p className="mt-3 text-xs text-muted">Only buyers whose offer was accepted, or whom the seller marked as the buyer, can leave a review.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
