import { Search } from "lucide-react";
import { LocationFields, type Option } from "@/components/LocationFields";

/**
 * Homepage search: keyword + category + state + LGA, all optional, submitted to /search (a plain GET form, so it works
 * before JavaScript loads). Leaving the location empty searches the whole market.
 */
export function LocationSearch({
  categories,
  regions,
  regionLabel,
  areaLabel,
  className = "",
}: {
  categories: { slug: string; name: string }[];
  regions: Option[];
  regionLabel: string;
  areaLabel: string | null;
  className?: string;
}) {
  const field = "input min-h-11";
  const label = "mb-1 block text-xs font-semibold text-muted";
  return (
    <form action="/search" method="get" role="search" aria-label="Search listings by location" data-testid="home-search"
      className={`grid gap-3 rounded-2xl bg-surface p-3 shadow-sm sm:grid-cols-2 ${areaLabel ? "lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]" : "lg:grid-cols-[1.6fr_1fr_1fr_auto]"} ${className}`}>
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor="home-q" className={label}>What are you looking for?</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input id="home-q" name="q" type="search" maxLength={100} placeholder="e.g. television, fabric, iPhone" className={`${field} pl-10`} enterKeyHint="search" />
        </div>
      </div>
      <div>
        <label htmlFor="home-category" className={label}>Category</label>
        <select id="home-category" name="category" className={field} defaultValue="">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      <LocationFields regions={regions} regionLabel={regionLabel} areaLabel={areaLabel} idPrefix="home" regionName="region" areaName="area"
        anyLabel="All" className="contents" labelClassName={label} selectClassName={field} />
      <div className="flex items-end sm:col-span-2 lg:col-span-1">
        <button type="submit" className="btn-primary min-h-11 w-full px-6">Search</button>
      </div>
    </form>
  );
}
