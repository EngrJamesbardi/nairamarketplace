"use client";
import { useState } from "react";
import { setCountry } from "@/app/actions/market";
import { countryFlag, COUNTRY_COOKIE } from "@/lib/countries";

type Opt = { code: string; name: string; currency_code: string };

/**
 * Market selector. With JavaScript it sets the preference cookie and reloads the page
 * (the server only honours codes of active markets). Without JavaScript the form posts to a server action.
 */
export function CountrySelect({ countries, current, compact = false }: { countries: Opt[]; current: string; compact?: boolean }) {
  const [pending, setPending] = useState(false);
  const id = compact ? "country-compact" : "country";
  return (
    <form action={setCountry} className="relative">
      <label htmlFor={id} className="sr-only">
        Market (country)
      </label>
      <select
        id={id}
        name="country"
        value={current}
        aria-busy={pending}
        disabled={pending}
        onChange={(e) => {
          document.cookie = `${COUNTRY_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          setPending(true);
          // Full reload: every price, list and filter on the page depends on the market.
          window.location.reload();
        }}
        className="min-h-11 cursor-pointer rounded-xl border border-line bg-surface py-2 pl-2 pr-7 text-sm font-medium text-ink hover:border-brand"
      >
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {countryFlag(c.code)} {compact ? c.code : `${c.name} · ${c.currency_code}`}
          </option>
        ))}
      </select>
      <noscript>
        <button className="btn-secondary ml-2">Go</button>
      </noscript>
    </form>
  );
}
