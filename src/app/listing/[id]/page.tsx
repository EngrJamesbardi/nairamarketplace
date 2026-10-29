import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, BadgeCheck, Truck, Clock, Eye, Heart, MessageCircle, Pencil, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { PriceTag } from "@/components/ProductCard";
import { FavouriteButton } from "@/components/FavouriteButton";
import { formatMoney, minorToMajorString } from "@/lib/money";
import { t } from "@/i18n";
import { ViewTracker, Gallery, ContactForm, OfferForm, ReportForm, ShareButton } from "./client";
import { WhatsAppLink } from "@/components/WhatsAppLink";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("*, category:categories!listings_category_id_fkey(name, slug, attribute_schema), subcategory:categories!listings_subcategory_id_fkey(name, slug), region:regions(name), images:listing_images(url, alt_text, position)")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return null;
  const [{ data: seller }, { data: profile }, { data: rating }, { data: country }] = await Promise.all([
    supabase.from("seller_profiles").select("*").eq("user_id", listing.seller_id).maybeSingle(),
    supabase.from("public_profiles").select("display_name, created_at").eq("id", listing.seller_id).maybeSingle(),
    supabase.from("seller_ratings").select("*").eq("seller_id", listing.seller_id).maybeSingle(),
    supabase.from("countries").select("name, locale, region_label").eq("code", listing.country_code).maybeSingle(),
  ]);
  return { listing, seller, profile, rating, country };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await load((await params).id);
  if (!data) return { title: "Listing not found" };
  const { listing } = data;
  const price = listing.price_minor !== null ? formatMoney(listing.price_minor, listing.currency, `en-${listing.country_code}`) : "Contact for price";
  const img = [...(listing.images ?? [])].sort((a, b) => a.position - b.position)[0]?.url;
  return {
    title: `${listing.title} – ${price}`,
    description: listing.description.slice(0, 160),
    alternates: { canonical: `/listing/${listing.id}` },
    robots: { index: listing.status === "active" && listing.moderation_status === "approved" && !listing.is_seed },
    openGraph: { title: listing.title, description: listing.description.slice(0, 160), images: img ? [img] : undefined, type: "website" },
  };
}

export default async function ListingPage({ params }: Params) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { listing, seller, profile, rating, country } = data;
  const session = await getSession();
  const isOwner = session.user?.id === listing.seller_id;
  const images = [...(listing.images ?? [])].sort((a, b) => a.position - b.position);
  const available = listing.status === "active" && listing.moderation_status === "approved";

  let favourited = false;
  let existingConversation: string | null = null;
  if (session.user && !isOwner) {
    const supabase = session.supabase;
    const [{ data: fav }, { data: conv }] = await Promise.all([
      supabase.from("favourites").select("listing_id").eq("user_id", session.user.id).eq("listing_id", id).maybeSingle(),
      supabase.from("conversations").select("id").eq("listing_id", id).eq("buyer_id", session.user.id).maybeSingle(),
    ]);
    favourited = !!fav;
    existingConversation = conv?.id ?? null;
  }

  const attrSchema = (listing.category?.attribute_schema ?? []) as { key: string; label: string }[];
  const attrs = (listing.attributes ?? {}) as Record<string, string | number>;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description,
    image: images.map((i) => i.url),
    itemCondition: listing.condition === "new" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
    ...(listing.price_minor !== null && {
      offers: {
        "@type": "Offer",
        price: minorToMajorString(listing.price_minor, listing.currency),
        priceCurrency: listing.currency,
        availability: available ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      },
    }),
  };

  return (
    <div className="page">
      {available && !listing.is_seed && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <ViewTracker listingId={listing.id} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link href="/" className="hover:text-brand">Home</Link> /{" "}
        <Link href={`/search?category=${listing.category?.slug}`} className="hover:text-brand">{listing.category?.name}</Link>
        {listing.subcategory && <> / <Link href={`/search?category=${listing.subcategory.slug}`} className="hover:text-brand">{listing.subcategory.name}</Link></>}
      </nav>

      {listing.moderation_status !== "approved" && (
        <div role="status" className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <strong>Not public: </strong>
          {listing.moderation_status === "pending_review" ? "This listing is waiting for moderator review." : "This listing was removed by moderation."}
          {listing.moderation_note && <> ({listing.moderation_note})</>}
        </div>
      )}
      {listing.is_seed && (
        <p className="mb-4 rounded-xl bg-ink/5 p-3 text-sm text-muted"><strong>Demo listing.</strong> Created for development testing; not a real item for sale.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Gallery images={images} title={listing.title} />

        <div className="space-y-4">
          <div className="card space-y-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold leading-tight sm:text-2xl">{listing.title}</h1>
              {!isOwner && <FavouriteButton listingId={listing.id} initial={favourited} />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PriceTag priceMinor={listing.price_minor} currency={listing.currency} priceType={listing.price_type} country={listing.country_code} className="text-2xl text-brand-strong" />
              {listing.price_type === "negotiable" && <span className="badge bg-cream text-brand-strong">{t("listing.negotiable")}</span>}
              {listing.status !== "active" && <span className="badge bg-ink text-white">{t(`status.${listing.status}`)}</span>}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-muted">Condition</dt><dd className="font-medium">{t(`condition.${listing.condition}`)}</dd></div>
              <div><dt className="text-muted">Quantity</dt><dd className="font-medium">{listing.quantity > 0 ? listing.quantity : "Out of stock"}</dd></div>
              <div className="col-span-2 flex items-center gap-1"><MapPin className="size-4 text-muted" aria-hidden />
                <dd>{[listing.city, listing.region?.name, country?.name].filter(Boolean).join(", ")}</dd></div>
            </dl>
            <p className="flex flex-wrap gap-3 text-xs text-muted">
              <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> Listed {new Date(listing.published_at ?? listing.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="flex items-center gap-1"><Eye className="size-3.5" aria-hidden /> {listing.view_count} views</span>
              <span className="flex items-center gap-1"><Heart className="size-3.5" aria-hidden /> {listing.favourite_count} saves</span>
            </p>
          </div>

          {isOwner ? (
            <div className="card space-y-2 p-5">
              <p className="font-semibold">This is your listing</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/listings/${listing.id}/edit`} className="btn-primary"><Pencil className="size-4" aria-hidden /> Manage listing</Link>
                <Link href="/dashboard/offers" className="btn-secondary">View offers</Link>
              </div>
            </div>
          ) : available ? (
            <div className="card space-y-4 p-5">
              {existingConversation ? (
                <Link href={`/messages/${existingConversation}`} className="btn-primary w-full"><MessageCircle className="size-4" aria-hidden /> Continue conversation</Link>
              ) : session.user ? (
                <ContactForm listingId={listing.id} sellerName={seller?.shop_name ?? "seller"} />
              ) : (
                <Link href={`/auth/login?next=/listing/${listing.id}`} className="btn-primary w-full">Sign in to message the seller</Link>
              )}
              {session.user && listing.price_type !== "contact" && (
                <OfferForm listingId={listing.id} currency={listing.currency} maxQty={listing.quantity} />
              )}
              {seller?.show_whatsapp && seller.whatsapp_number && <WhatsAppLink number={seller.whatsapp_number} text={`Hi, I'm interested in "${listing.title}" on Naira Marketplace`} />}
            </div>
          ) : (
            <div className="card p-5 text-sm text-muted">This item is not available for new enquiries.</div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <ShareButton title={listing.title} />
            {session.user && !isOwner && <ReportForm targetType="listing" listingId={listing.id} />}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="h2 mb-2">Description</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed">{listing.description}</p>
            {attrSchema.length > 0 && Object.keys(attrs).length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-sm">
                {attrSchema.filter((a) => attrs[a.key] !== undefined && attrs[a.key] !== "").map((a) => (
                  <div key={a.key}><dt className="text-muted">{a.label}</dt><dd className="font-medium">{String(attrs[a.key])}</dd></div>
                ))}
              </dl>
            )}
          </section>
          <section className="card p-5">
            <h2 className="h2 mb-2 flex items-center gap-2"><Truck className="size-5 text-brand" aria-hidden /> Delivery & collection</h2>
            <ul className="flex flex-wrap gap-2">
              {listing.delivery_options.map((d) => <li key={d} className="chip">{t(`delivery.${d}`)}</li>)}
            </ul>
            {listing.delivery_notes && <p className="mt-2 text-sm">{listing.delivery_notes}</p>}
            <p className="mt-3 flex gap-2 rounded-lg bg-cream p-3 text-xs text-ink">
              <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              {t("fulfilment.notice")} Delivery costs and times are not set by the platform; agree them with the seller. International shipping is only available if the seller says so.
            </p>
          </section>
        </div>

        {seller && (
          <aside className="card h-fit space-y-3 p-5" aria-label="Seller">
            <div className="flex items-center gap-3">
              <span className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-cream text-xl font-bold text-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {seller.logo_url ? <img src={seller.logo_url} alt="" className="size-full object-cover" /> : seller.shop_name.slice(0, 1)}
              </span>
              <div>
                <Link href={`/s/${seller.slug}`} className="flex items-center gap-1 font-semibold hover:text-brand">
                  {seller.shop_name}
                  {seller.verification_status === "verified" && <BadgeCheck className="size-4 text-success" aria-label="Verified seller" />}
                </Link>
                <p className="text-xs text-muted">
                  {t(`sellerType.${seller.seller_type}`)} · Member since {new Date(profile?.created_at ?? seller.created_at).getFullYear()}
                </p>
              </div>
            </div>
            <p className="text-sm">
              {rating?.review_count ? <>★ {rating.avg_rating} · {rating.review_count} review{rating.review_count === 1 ? "" : "s"} ({rating.verified_count} confirmed sale{rating.verified_count === 1 ? "" : "s"})</> : "No reviews yet"}
            </p>
            {seller.verification_status !== "verified" && (
              <p className="text-xs text-muted">This seller&apos;s identity has not been independently verified.</p>
            )}
            <Link href={`/s/${seller.slug}`} className="btn-secondary w-full">Visit storefront</Link>
            {session.user && !isOwner && <ReportForm targetType="user" userId={listing.seller_id} label="Report seller" />}
          </aside>
        )}
      </div>
    </div>
  );
}
