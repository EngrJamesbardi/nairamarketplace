import { requireAdminOnly } from "@/lib/auth";
import { getCountries } from "@/lib/market";
import { minorToMajorString } from "@/lib/money";
import { Op, Flash, smallPrimary } from "../ui";

export default async function Plans({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdminOnly();
  const [countries, { data: plans }, { data: subs }] = await Promise.all([
    getCountries(),
    supabase.from("subscription_plans").select("*").order("country_code").order("sort_order"),
    supabase.from("subscriptions").select("plan_id").eq("status", "active").gt("current_period_end", new Date().toISOString()),
  ]);
  const count = (id: string) => (subs ?? []).filter((s) => s.plan_id === id).length;
  return (
    <>
      <h1 className="h1">Subscription plans</h1>
      <Flash sp={sp} />
      <p className="text-sm text-muted">Plans raise the active-listing allowance and include promotion credits. They do not renew automatically yet. Price changes apply to new purchases and renewals only.</p>
      {countries.map((c) => (
        <section key={c.code} className="card space-y-3 p-4">
          <h2 className="h2">{c.name} <span className="text-sm font-normal text-muted">({c.currency_code}) · free allowance {c.free_active_listing_limit}</span></h2>
          {[...(plans ?? []).filter((p) => p.country_code === c.code), null].map((p) => (
            <Op key={p?.id ?? "new"} op="plan.upsert" back="/admin/plans" className="grid items-end gap-2 border-t border-line pt-3 sm:grid-cols-6">
              {p && <input type="hidden" name="id" value={p.id} />}
              <input type="hidden" name="country" value={c.code} />
              <label className="text-xs">Code<input name="code" required defaultValue={p?.code} readOnly={!!p} placeholder="trader-plus" className="input min-h-9 py-1" /></label>
              <label className="text-xs">Name<input name="name" required defaultValue={p?.name} className="input min-h-9 py-1" /></label>
              <label className="text-xs">Price ({c.currency_code})<input name="price" required inputMode="decimal" defaultValue={p ? minorToMajorString(p.price_minor, p.currency) : ""} className="input min-h-9 py-1" /></label>
              <label className="text-xs">Period (days)<input name="period_days" type="number" min={1} required defaultValue={p?.period_days ?? 30} className="input min-h-9 py-1" /></label>
              <label className="text-xs">Active listings<input name="listing_limit" type="number" min={1} required defaultValue={p?.active_listing_limit} className="input min-h-9 py-1" /></label>
              <label className="text-xs">Credits / period<input name="monthly_credits" type="number" min={0} required defaultValue={p?.monthly_credits ?? 0} className="input min-h-9 py-1" /></label>
              <label className="text-xs sm:col-span-3">Description<input name="description" defaultValue={p?.description ?? ""} className="input min-h-9 py-1" /></label>
              <label className="text-xs">Sort<input name="sort" type="number" defaultValue={p?.sort_order ?? 0} className="input min-h-9 py-1" /></label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={p?.is_active ?? true} className="size-4 accent-[var(--brand)]" /> Active{p && ` · ${count(p.id)} subscribers`}</label>
              <button className={smallPrimary}>{p ? "Save" : "Add plan"}</button>
            </Op>
          ))}
        </section>
      ))}
    </>
  );
}
