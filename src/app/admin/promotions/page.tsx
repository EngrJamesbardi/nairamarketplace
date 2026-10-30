import Link from "next/link";
import { requireAdminOnly } from "@/lib/auth";
import { getCountries } from "@/lib/market";
import { formatMoney, minorToMajorString } from "@/lib/money";
import { Op, Flash, smallPrimary } from "../ui";

const PLACEMENTS = [["search", "Search"], ["homepage", "Homepage"], ["category", "Category"]] as const;

export default async function PromotionPackages({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdminOnly();
  const [countries, { data: packages }, { data: live }] = await Promise.all([
    getCountries(),
    supabase.from("promotion_packages").select("*").order("country_code").order("sort_order"),
    supabase.from("promotion_campaigns").select("listing_id").not("payment_id", "is", null).eq("status", "active").gt("ends_at", new Date().toISOString()),
  ]);
  const liveListings = new Set((live ?? []).map((c) => c.listing_id)).size;
  const back = "/admin/promotions";
  return (
    <>
      <h1 className="h1">Promotion packages</h1>
      <Flash sp={sp} />
      <p className="text-sm text-muted">
        Packages are offered to sellers as the last step of publishing a listing and on their Promotions page. Prices are per market and
        in that market&apos;s currency; a market with no active package shows sellers only the free standard listing. Changes apply to new
        checkouts only. A promotion starts when the payment provider confirms payment and ends automatically after its duration.
      </p>
      <p className="text-sm">
        {liveListings} listing{liveListings === 1 ? " is" : "s are"} on a paid promotion right now. <Link className="link" href="/admin/campaigns">Manage active and expired promotions</Link>
      </p>
      {countries.map((c) => {
        const rows = (packages ?? []).filter((p) => p.country_code === c.code);
        return (
          <section key={c.code} className="card space-y-3 p-4" data-testid={`packages-${c.code}`}>
            <h2 className="h2">
              {c.name}{" "}
              <span className="text-sm font-normal text-muted">({c.currency_code}{c.is_active ? "" : ", inactive market"}{c.payment_provider ? "" : ", no payment provider"})</span>
            </h2>
            {rows.length === 0 && <p className="text-sm text-muted">No packages: sellers in {c.name} only see the free standard listing.</p>}
            {[...rows, null].map((p) => (
              <Op key={p?.id ?? "new"} op="promo_package.upsert" back={back} className="grid items-end gap-2 border-t border-line pt-3 sm:grid-cols-6">
                {p && <input type="hidden" name="id" value={p.id} />}
                <input type="hidden" name="country" value={c.code} />
                <label className="text-xs sm:col-span-2">Name<input name="name" required defaultValue={p?.name} placeholder="e.g. Promote for 14 days" className="input min-h-9 py-1" /></label>
                <label className="text-xs">Code<input name="code" required defaultValue={p?.code} readOnly={!!p} placeholder="promote-14" className="input min-h-9 py-1" /></label>
                <label className="text-xs">Days<input name="days" type="number" min={1} max={90} required defaultValue={p?.days} className="input min-h-9 py-1" /></label>
                <label className="text-xs">Price ({c.currency_code})<input name="price" required inputMode="decimal" defaultValue={p ? minorToMajorString(p.price_minor, p.currency) : ""} className="input min-h-9 py-1" /></label>
                <label className="text-xs">Sort<input name="sort" type="number" defaultValue={p?.sort_order ?? 0} className="input min-h-9 py-1" /></label>
                <label className="text-xs sm:col-span-3">Description shown to sellers<input name="description" maxLength={300} defaultValue={p?.description ?? ""} className="input min-h-9 py-1" /></label>
                <fieldset className="flex flex-wrap items-center gap-3 text-xs sm:col-span-2">
                  <legend className="sr-only">Placements</legend>
                  {PLACEMENTS.map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1">
                      <input type="checkbox" name="placements" value={v} defaultChecked={p ? p.placements.includes(v) : true} className="size-4 accent-[var(--brand)]" /> {l}
                    </label>
                  ))}
                  <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={p?.is_active ?? true} className="size-4 accent-[var(--brand)]" /> Active</label>
                </fieldset>
                <button className={smallPrimary}>{p ? `Save (${formatMoney(p.price_minor, p.currency)})` : "Add package"}</button>
              </Op>
            ))}
          </section>
        );
      })}
    </>
  );
}
