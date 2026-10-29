import { requireAdminOnly } from "@/lib/auth";
import { getCountries } from "@/lib/market";
import { minorToMajorString } from "@/lib/money";
import { providerStatus } from "@/lib/payments";
import { Op, Flash, smallPrimary } from "../ui";

export default async function Monetisation({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdminOnly();
  const [countries, { data: packages }, { data: prices }] = await Promise.all([
    getCountries(),
    supabase.from("credit_packages").select("*").order("country_code").order("sort_order"),
    supabase.from("promotion_prices").select("*"),
  ]);
  const back = "/admin/monetisation";
  return (
    <>
      <h1 className="h1">Credits & packages</h1>
      <Flash sp={sp} />
      <section className="card space-y-2 p-4 text-sm">
        <h2 className="h2">Payment providers</h2>
        <ul>
          {providerStatus().map((p) => (
            <li key={p.key}>{p.label}: <strong>{p.enabled ? "enabled" : "disabled"}</strong>, credentials {p.configured ? "present" : <strong className="text-danger">missing</strong>}</li>
          ))}
        </ul>
        <p className="text-muted">Which provider a market uses is set on the Countries page. Providers are enabled per deployment with PAYMENTS_ENABLED_PROVIDERS. The starting prices below are placeholders: review them before taking real payments.</p>
      </section>
      {countries.map((c) => (
        <section key={c.code} className="card space-y-3 p-4">
          <h2 className="h2">{c.name} <span className="text-sm font-normal text-muted">({c.currency_code}{c.is_active ? "" : ", inactive market"})</span></h2>
          <h3 className="font-semibold">Credit packages</h3>
          {[...(packages ?? []).filter((p) => p.country_code === c.code), null].map((p) => (
            <Op key={p?.id ?? "new"} op="package.upsert" back={back} className="grid items-end gap-2 sm:grid-cols-7">
              {p && <input type="hidden" name="id" value={p.id} />}
              <input type="hidden" name="country" value={c.code} />
              <label className="text-xs sm:col-span-2">Name<input name="name" required defaultValue={p?.name} placeholder="New package" className="input min-h-9 py-1" /></label>
              <label className="text-xs">Credits<input name="credits" type="number" min={1} required defaultValue={p?.credits} className="input min-h-9 py-1" /></label>
              <label className="text-xs">Price ({c.currency_code})<input name="price" required inputMode="decimal" defaultValue={p ? minorToMajorString(p.price_minor, p.currency) : ""} className="input min-h-9 py-1" /></label>
              <label className="text-xs">Sort<input name="sort" type="number" defaultValue={p?.sort_order ?? 0} className="input min-h-9 py-1" /></label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={p?.is_active ?? true} className="size-4 accent-[var(--brand)]" /> Active</label>
              <button className={smallPrimary}>{p ? "Save" : "Add package"}</button>
            </Op>
          ))}
          <h3 className="font-semibold">Promotion prices (credits per day)</h3>
          <div className="flex flex-wrap gap-3">
            {(["search", "homepage", "category"] as const).map((pl) => (
              <Op key={pl} op="promo_price.set" back={back}>
                <input type="hidden" name="country" value={c.code} /><input type="hidden" name="placement" value={pl} />
                <label className="text-xs">{pl}<input name="credits_per_day" type="number" min={1} required defaultValue={prices?.find((x) => x.country_code === c.code && x.placement === pl)?.credits_per_day} className="input min-h-9 w-24 py-1" /></label>
                <button className={smallPrimary}>Save</button>
              </Op>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
