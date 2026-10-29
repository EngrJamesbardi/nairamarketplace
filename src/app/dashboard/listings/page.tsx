import Link from "next/link";
import { Plus, Eye, Heart, MessageCircle } from "lucide-react";
import { requireSeller } from "@/lib/auth";
import { PriceTag, EmptyState } from "@/components/ProductCard";
import { ListingActions } from "../row-actions";
import { t } from "@/i18n";
import { LISTING_STATUSES } from "@/lib/validation";

export const metadata = { title: "My listings" };

export default async function MyListings({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; saved?: string; updated?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireSeller();
  let q = supabase.from("listings").select("id, title, status, moderation_status, moderation_note, price_minor, currency, price_type, country_code, view_count, favourite_count, message_count, expires_at, images:listing_images(url, position)").eq("seller_id", user.id).order("updated_at", { ascending: false }).limit(200);
  if (sp.status && (LISTING_STATUSES as readonly string[]).includes(sp.status)) q = q.eq("status", sp.status as (typeof LISTING_STATUSES)[number]);
  const { data: listings } = await q;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">My listings</h1>
        <Link href="/dashboard/listings/new" className="btn-primary"><Plus className="size-4" aria-hidden /> New listing</Link>
      </div>
      {sp.error && <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">{sp.error}</p>}
      {(sp.saved || sp.updated) && <p role="status" className="rounded-lg bg-success/5 p-3 text-sm text-success">Listing {sp.saved ? "saved" : "updated"}.</p>}
      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        <Link href="/dashboard/listings" className={`chip ${!sp.status ? "chip-active" : ""}`}>All</Link>
        {LISTING_STATUSES.map((s) => <Link key={s} href={`/dashboard/listings?status=${s}`} className={`chip ${sp.status === s ? "chip-active" : ""}`}>{t(`status.${s}`)}</Link>)}
      </nav>
      {!listings?.length ? (
        <EmptyState title="No listings here yet" action={<Link href="/dashboard/listings/new" className="btn-primary mt-2">Post a listing</Link>} />
      ) : (
        <ul className="space-y-3">
          {listings.map((l) => {
            const img = [...l.images].sort((a, b) => a.position - b.position)[0]?.url;
            return (
              <li key={l.id} className="card flex flex-col gap-3 p-3 sm:flex-row" data-testid="my-listing">
                <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-canvas">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img && <img src={img} alt="" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/listings/${l.id}/edit`} className="font-semibold hover:text-brand">{l.title}</Link>
                    <span className="badge bg-cream text-brand-strong">{t(`status.${l.status}`)}</span>
                    {l.moderation_status !== "approved" && <span className="badge bg-warning/15 text-warning">{l.moderation_status.replace("_", " ")}</span>}
                  </div>
                  <PriceTag priceMinor={l.price_minor} currency={l.currency} priceType={l.price_type} country={l.country_code} className="text-sm" />
                  <p className="flex gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{l.view_count} views</span>
                    <span className="flex items-center gap-1"><Heart className="size-3.5" aria-hidden />{l.favourite_count} saves</span>
                    <span className="flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden />{l.message_count} enquiries</span>
                    {l.expires_at && l.status === "active" && <span>Expires {new Date(l.expires_at).toLocaleDateString("en-GB")}</span>}
                  </p>
                  <ListingActions listing={l} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
