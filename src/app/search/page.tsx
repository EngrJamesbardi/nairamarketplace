import Link from "next/link";
import type { Metadata } from "next";
import { SlidersHorizontal } from "lucide-react";
import { ProductCard, ProductGrid, EmptyState } from "@/components/ProductCard";
import { getActiveCountries, getAreas, getCategories, getRegions, getSelectedCountry } from "@/lib/market";
import { LocationFields } from "@/components/LocationFields";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { favouriteIds } from "@/lib/listings";
import { getSponsored } from "@/lib/promotions";
import { parseToMinor, minorToMajorString } from "@/lib/money";
import { CONDITIONS } from "@/lib/validation";
import { t } from "@/i18n";
import { countryFlag } from "@/lib/countries";

const PAGE_SIZE = 24;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const q = one((await searchParams).q);
  return { title: q ? `Search: ${q}` : "Browse listings", robots: { index: !q } };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [selected, countries, categories, session] = await Promise.all([getSelectedCountry(), getActiveCountries(), getCategories(), getSession()]);

  // Optional cross-border exploration: ?country=GH. Defaults to the selected market.
  const countryParam = one(sp.country).toUpperCase();
  const country = countries.find((c) => c.code === countryParam && c.allow_cross_border_discovery) ?? selected;
  const regions = await getRegions(country.code);

  const q = one(sp.q).slice(0, 100);
  const category = one(sp.category);
  // Location filters are ids validated against this market: an unknown state is ignored, and an LGA must belong to the
  // chosen state (or, if no state was sent, it selects its own state).
  let regionId = regions.find((r) => r.id === Number(one(sp.region)))?.id ?? null;
  let areaId: number | null = null;
  const areaParam = Number(one(sp.area)) || null;
  if (areaParam && country.area_label) {
    const { data: area } = await (await createClient()).from("areas").select("id, region_id").eq("id", areaParam).eq("country_code", country.code).maybeSingle();
    if (area && (!regionId || area.region_id === regionId)) {
      areaId = area.id;
      regionId = area.region_id;
    }
  }
  const areas = await getAreas(regionId);
  const regionName = regions.find((r) => r.id === regionId)?.name;
  const areaName = areas.find((a) => a.id === areaId)?.name;
  const city = one(sp.city).slice(0, 80) || null;
  const conditions = (Array.isArray(sp.condition) ? sp.condition : sp.condition ? [sp.condition] : []).filter((c) =>
    (CONDITIONS as readonly string[]).includes(c),
  );
  const negotiable = one(sp.negotiable) === "1";
  const includeUnavailable = one(sp.unavailable) === "1";
  const sort = ["relevance", "newest", "price_asc", "price_desc", "nearest"].includes(one(sp.sort)) ? one(sp.sort) : q ? "relevance" : "newest";
  const page = Math.max(1, Math.min(200, Number(one(sp.page)) || 1));
  const minPrice = one(sp.min) ? parseToMinor(one(sp.min), country.currency_code) : null;
  const maxPrice = one(sp.max) ? parseToMinor(one(sp.max), country.currency_code) : null;
  const km = Number(one(sp.km)) || null;
  const seller = one(sp.seller) || null;

  // "Near" uses the approximate centre of the chosen region (or your profile region). No GPS is collected.
  const nearRegionId = regionId ?? (session.profile?.country_code === country.code ? session.profile.region_id : null);
  const nearRegion = regions.find((r) => r.id === nearRegionId);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_listings", {
    p_query: q || undefined,
    p_country: country.code,
    p_category: category || undefined,
    p_region_id: km ? undefined : regionId ?? undefined,
    p_area_id: km ? undefined : areaId ?? undefined,
    p_city: city ?? undefined,
    p_min_price: minPrice !== null ? Number(minPrice) : undefined,
    p_max_price: maxPrice !== null ? Number(maxPrice) : undefined,
    p_conditions: conditions.length ? (conditions as (typeof CONDITIONS)[number][]) : undefined,
    p_negotiable_only: negotiable,
    p_seller_id: seller ?? undefined,
    p_include_unavailable: includeUnavailable,
    p_near_lat: km && nearRegion?.latitude ? Number(nearRegion.latitude) : undefined,
    p_near_lng: km && nearRegion?.longitude ? Number(nearRegion.longitude) : undefined,
    p_max_km: km ?? undefined,
    p_sort: sort,
    p_limit: PAGE_SIZE + 1,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const results = rows.slice(0, PAGE_SIZE);

  const sponsored = page === 1 ? await getSponsored(category && !q ? "category" : "search", country.code, { category, query: q, limit: 2 }) : [];
  const favs = await favouriteIds(session.user?.id, [...results.map((r) => r.id), ...sponsored.map((s) => s.item.id)]);

  const topCats = categories.filter((c) => !c.parent_id);
  const activeCat = categories.find((c) => c.slug === category);
  const subCats = activeCat ? categories.filter((c) => c.parent_id === (activeCat.parent_id ?? activeCat.id)) : [];

  const qs = (overrides: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
      else if (v) p.set(k, v);
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/search?${p.toString()}`;
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="h1">
          {q ? <>Results for &ldquo;{q}&rdquo;</> : activeCat ? activeCat.name : "Browse listings"}
          {(areaName || regionName) && !km && <span className="font-normal text-muted"> in {[areaName, regionName].filter(Boolean).join(", ")}</span>}
        </h1>
        <p className="text-sm text-muted">
          {countryFlag(country.code)} {country.name} · prices in {country.currency_code}
          {country.code !== selected.code && (
            <>
              {" "}· <Link className="link" href={qs({ country: null, min: null, max: null, region: null, area: null, page: null })}>Back to {selected.name}</Link>
            </>
          )}
        </p>
      </div>

      <nav aria-label="Categories" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={qs({ category: null, page: null })} className={`chip shrink-0 ${!category ? "chip-active" : ""}`}>All</Link>
        {topCats.map((c) => (
          <Link key={c.id} href={qs({ category: c.slug, page: null })} aria-current={category === c.slug ? "true" : undefined}
            className={`chip shrink-0 ${category === c.slug || activeCat?.parent_id === c.id ? "chip-active" : ""}`}>
            {c.name}
          </Link>
        ))}
      </nav>
      {subCats.length > 0 && (
        <nav aria-label="Subcategories" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {subCats.map((c) => (
            <Link key={c.id} href={qs({ category: c.slug, page: null })} className={`chip shrink-0 text-xs ${category === c.slug ? "chip-active" : ""}`}>
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <details className="card h-fit p-4" open>
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold lg:pointer-events-none">
            <SlidersHorizontal className="size-4 text-brand" aria-hidden /> Filters
          </summary>
          <form action="/search" method="get" className="mt-3 space-y-4 text-sm" data-testid="filters">
            {q && <input type="hidden" name="q" value={q} />}
            {category && <input type="hidden" name="category" value={category} />}
            {seller && <input type="hidden" name="seller" value={seller} />}
            <div>
              <label className="label" htmlFor="f-country">Market</label>
              <select id="f-country" name="country" defaultValue={country.code} className="input">
                {countries.filter((c) => c.allow_cross_border_discovery || c.code === selected.code).map((c) => (
                  <option key={c.code} value={c.code}>{c.name} ({c.currency_code})</option>
                ))}
              </select>
            </div>
            <LocationFields key={country.code} regions={regions} regionLabel={country.region_label} areaLabel={country.area_label} idPrefix="f"
              regionName="region" areaName="area" anyLabel="All" initialRegionId={regionId} initialAreaId={areaId} initialAreas={areas} className="space-y-4" />
            <div>
              <label className="label" htmlFor="f-city">City or area</label>
              <input id="f-city" name="city" defaultValue={city ?? ""} className="input" maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="f-km">Distance from {country.region_label.toLowerCase()} centre</label>
              <select id="f-km" name="km" defaultValue={km ?? ""} className="input">
                <option value="">Any distance</option>
                {[10, 25, 50, 100, 250].map((k) => <option key={k} value={k}>Within {k} km</option>)}
              </select>
              <p className="mt-1 text-xs text-muted">Approximate, based on the region centre. Choose a {country.region_label.toLowerCase()} above.</p>
            </div>
            <fieldset>
              <legend className="label">Price ({country.currency_code})</legend>
              <div className="flex gap-2">
                <input aria-label="Minimum price" name="min" inputMode="decimal" placeholder="Min" className="input"
                  defaultValue={minPrice !== null ? minorToMajorString(minPrice, country.currency_code).replace(/\.00$/, "") : ""} />
                <input aria-label="Maximum price" name="max" inputMode="decimal" placeholder="Max" className="input"
                  defaultValue={maxPrice !== null ? minorToMajorString(maxPrice, country.currency_code).replace(/\.00$/, "") : ""} />
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">Condition</legend>
              <div className="space-y-1">
                {CONDITIONS.map((c) => (
                  <label key={c} className="flex min-h-8 items-center gap-2">
                    <input type="checkbox" name="condition" value={c} defaultChecked={conditions.includes(c)} className="size-4 accent-[var(--brand)]" />
                    {t(`condition.${c}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-8 items-center gap-2">
              <input type="checkbox" name="negotiable" value="1" defaultChecked={negotiable} className="size-4 accent-[var(--brand)]" />
              Negotiable only
            </label>
            <label className="flex min-h-8 items-center gap-2">
              <input type="checkbox" name="unavailable" value="1" defaultChecked={includeUnavailable} className="size-4 accent-[var(--brand)]" />
              Include reserved and sold
            </label>
            <div>
              <label className="label" htmlFor="f-sort">Sort by</label>
              <select id="f-sort" name="sort" defaultValue={sort} className="input">
                <option value="relevance">Best match</option>
                <option value="newest">Newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="nearest">Nearest</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1">Apply</button>
              <Link href="/search" className="btn-secondary">Reset</Link>
            </div>
          </form>
        </details>

        <div className="space-y-4">
          {sponsored.length > 0 && (
            <section aria-label="Sponsored results">
              <ProductGrid>
                {sponsored.map((s) => (
                  <ProductCard key={s.campaignId} item={s.item} sponsored campaignId={s.campaignId} favourited={favs.has(s.item.id!)} />
                ))}
              </ProductGrid>
            </section>
          )}
          {error ? (
            <EmptyState title="Search is unavailable right now" body="Please try again in a moment." />
          ) : results.length === 0 ? (
            <EmptyState
              title="No listings match your search"
              body="Try fewer filters, a different spelling, or another category."
              action={<Link href="/search" className="btn-secondary mt-2">Clear filters</Link>}
            />
          ) : (
            <>
              <p className="sr-only" role="status">{results.length} results on this page</p>
              <ProductGrid>
                {results.map((l) => <ProductCard key={l.id} item={l} favourited={favs.has(l.id!)} />)}
              </ProductGrid>
            </>
          )}
          {(page > 1 || hasMore) && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-3 pt-2">
              {page > 1 && <Link className="btn-secondary" href={qs({ page: String(page - 1) })} rel="prev">Previous</Link>}
              <span className="text-sm text-muted">Page {page}</span>
              {hasMore && <Link className="btn-secondary" href={qs({ page: String(page + 1) })} rel="next">Next</Link>}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
