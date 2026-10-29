"use client";
import { useTransition } from "react";
import { setCountry } from "@/app/actions/market";
import { countryFlag } from "@/lib/countries";

type Opt = { code: string; name: string; currency_code: string };

export function CountrySelect({ countries, current, compact = false }: { countries: Opt[]; current: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form action={setCountry} className="relative">
      <label htmlFor={compact ? "country-compact" : "country"} className="sr-only">
        Market (country)
      </label>
      <select
        id={compact ? "country-compact" : "country"}
        name="country"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("country", e.target.value);
          start(() => setCountry(fd));
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
