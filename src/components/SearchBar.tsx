import { Search } from "lucide-react";

export function SearchBar({ defaultValue = "", className = "" }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/search" method="get" role="search" className={`relative ${className}`}>
      <label htmlFor="site-search" className="sr-only">
        Search listings
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
      <input
        id="site-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search phones, fabric, furniture…"
        maxLength={100}
        className="input rounded-full pl-10 pr-24"
        enterKeyHint="search"
      />
      <button type="submit" className="btn-primary absolute right-1 top-1/2 min-h-9 -translate-y-1/2 rounded-full px-4">
        Search
      </button>
    </form>
  );
}
