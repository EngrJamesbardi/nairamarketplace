import { requireAdminOnly } from "@/lib/auth";
import { getCountries } from "@/lib/market";
import { Op, Flash, smallPrimary } from "../ui";
import { countryFlag } from "@/lib/countries";

export default async function Countries({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireAdminOnly();
  const countries = await getCountries();
  return (
    <>
      <h1 className="h1">Countries & markets</h1>
      <Flash sp={sp} />
      <p className="text-sm text-muted">Activate a market only when its operational, legal and payment requirements are ready. Inactive markets cannot receive new listings and are hidden from the country selector.</p>
      <ul className="space-y-3">
        {countries.map((c) => (
          <li key={c.code} className="card p-4">
            <Op op="country.update" back="/admin/countries" className="grid items-end gap-3 sm:grid-cols-6">
              <input type="hidden" name="code" value={c.code} />
              <div className="sm:col-span-2">
                <p className="font-semibold">{countryFlag(c.code)} {c.name}</p>
                <p className="text-xs text-muted">{c.currency_code} · {c.locale} · {c.phone_prefix} · {c.region_label}</p>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={c.is_active} className="size-4 accent-[var(--brand)]" /> Active</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_cross_border_discovery" defaultChecked={c.allow_cross_border_discovery} className="size-4 accent-[var(--brand)]" /> Discoverable abroad</label>
              <label className="text-xs">Free active listings (default 15)<input name="free_active_listing_limit" type="number" min={0} defaultValue={c.free_active_listing_limit} className="input min-h-9 py-1" /></label>
              <label className="text-xs">Listing duration (days)<input name="listing_duration_days" type="number" min={1} max={365} defaultValue={c.listing_duration_days} className="input min-h-9 py-1" /></label>
              <label className="text-xs sm:col-span-2">Payment provider
                <select name="payment_provider" defaultValue={c.payment_provider ?? ""} className="input min-h-9 py-1">
                  <option value="">None (paid services off)</option>
                  <option value="mock">mock (development only)</option>
                  <option value="paystack">paystack (requires credentials)</option>
                </select>
              </label>
              <button className={smallPrimary}>Save {c.code}</button>
            </Op>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">The free allowance is checked only when a listing is published or reactivated: lowering it never unpublishes existing listings. Paid plans (Subscription plans) set higher allowances.</p>
      <p className="text-xs text-muted">Adding a new country is a database migration (currency, phone format, regions) followed by activation here. See docs/ADDING_A_COUNTRY.md.</p>
    </>
  );
}
