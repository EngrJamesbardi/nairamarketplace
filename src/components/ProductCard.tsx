import Link from "next/link";
import { MapPin, BadgeCheck } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { t } from "@/i18n";
import type { Database } from "@/types/database";
import { FavouriteButton } from "@/components/FavouriteButton";

export type ListingCard = Database["public"]["Views"]["listing_cards"]["Row"];

export function PriceTag({
  priceMinor,
  currency,
  priceType,
  country,
  className = "",
}: {
  priceMinor: number | null;
  currency: string | null;
  priceType: string | null;
  country?: string | null;
  className?: string;
}) {
  if (priceType === "contact" || priceMinor === null || !currency) {
    return <span className={`font-bold text-ink ${className}`}>{t("listing.contactForPrice")}</span>;
  }
  return (
    <span className={`font-bold text-ink ${className}`}>
      <span>{formatMoney(priceMinor, currency, `en-${country ?? "NG"}`)}</span>
      <span className="sr-only"> ({currency})</span>
    </span>
  );
}

export function ProductCard({
  item,
  sponsored = false,
  campaignId,
  favourited,
  showFavourite = true,
}: {
  item: ListingCard;
  sponsored?: boolean;
  campaignId?: string;
  favourited?: boolean;
  showFavourite?: boolean;
}) {
  const href = sponsored && campaignId ? `/api/promotions/click?c=${campaignId}&l=${item.id}` : `/listing/${item.id}`;
  return (
    <article
      className={`card group relative flex flex-col overflow-hidden transition-shadow hover:shadow-md ${
        sponsored ? "ring-1 ring-amber" : ""
      }`}
      data-testid="product-card"
      data-sponsored={sponsored ? "true" : undefined}
      data-campaign={sponsored && campaignId ? campaignId : undefined}
    >
      <Link href={href} className="block" prefetch={false}>
        <div className="relative aspect-square bg-canvas">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-muted">No photo</div>
          )}
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {sponsored && <span className="badge bg-sponsored-bg text-sponsored-fg shadow-sm">{t("listing.sponsored")}</span>}
            {item.is_seed && <span className="badge bg-ink/80 text-white">{t("listing.demo")}</span>}
            {item.status === "reserved" && <span className="badge bg-warning text-white">Reserved</span>}
            {item.status === "sold" && <span className="badge bg-ink text-white">Sold</span>}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink">{item.title}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PriceTag priceMinor={item.price_minor} currency={item.currency} priceType={item.price_type} country={item.country_code} className="text-base" />
            {item.price_type === "negotiable" && (
              <span className="badge bg-cream text-brand-strong">{t("listing.negotiable")}</span>
            )}
          </div>
          <p className="text-xs text-muted">{item.condition ? t(`condition.${item.condition}` as never) : null}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{[item.city, item.region_name].filter(Boolean).join(", ") || item.country_code}</span>
          </p>
          {item.shop_name && (
            <p className="mt-auto flex items-center gap-1 truncate pt-1 text-xs font-medium text-ink">
              <span className="truncate">{item.shop_name}</span>
              {item.seller_verification === "verified" && (
                <BadgeCheck className="size-3.5 shrink-0 text-success" aria-label="Verified seller" />
              )}
            </p>
          )}
        </div>
      </Link>
      {showFavourite && item.id && (
        <div className="absolute right-2 top-2">
          <FavouriteButton listingId={item.id} initial={!!favourited} />
        </div>
      )}
    </article>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 bg-cream/60 px-6 py-10 text-center">
      <svg width="56" height="56" viewBox="0 0 512 512" aria-hidden="true">
        <path
          d="M96 112h320v52a32 32 0 0 1-64 0 32 32 0 0 1-64 0 32 32 0 0 1-64 0 32 32 0 0 1-64 0 32 32 0 0 1-64 0z"
          fill="var(--amber)"
        />
        <rect x="120" y="220" width="272" height="180" rx="24" fill="none" stroke="var(--brand)" strokeWidth="24" />
      </svg>
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ProductGrid>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse overflow-hidden" aria-hidden>
          <div className="aspect-square bg-line/60" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-4/5 rounded bg-line/70" />
            <div className="h-4 w-1/2 rounded bg-line/70" />
            <div className="h-3 w-1/3 rounded bg-line/70" />
          </div>
        </div>
      ))}
    </ProductGrid>
  );
}
