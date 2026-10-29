import { requireAdminOnly } from "@/lib/auth";
import { getCountries } from "@/lib/market";
import { Op, Flash, small, smallPrimary } from "../ui";

export default async function Policies({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdminOnly();
  const [{ data: terms }, { data: policies }, { data: settings }, countries] = await Promise.all([
    supabase.from("prohibited_terms").select("*").order("country_code", { nullsFirst: true }).order("term"),
    supabase.from("country_policies").select("*").order("country_code", { nullsFirst: true }),
    supabase.from("platform_settings").select("*"),
    getCountries(),
  ]);
  const back = "/admin/policies";
  const CountrySel = ({ value }: { value?: string | null }) => (
    <select name="country" defaultValue={value ?? ""} className="input min-h-9 py-1 text-xs" aria-label="Country"><option value="">All markets</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
  );
  return (
    <>
      <h1 className="h1">Policies & settings</h1>
      <Flash sp={sp} />
      <section className="card space-y-3 p-4">
        <h2 className="h2">Prohibited & restricted terms</h2>
        <p className="text-sm text-muted">&ldquo;Block&rdquo; rejects matching listings; &ldquo;Review&rdquo; holds them for moderation. Terms are matched as whole words in titles and descriptions. Get legal advice for each market.</p>
        <Op op="term.set" back={back} className="flex flex-wrap items-end gap-2">
          <CountrySel />
          <input name="term" required placeholder="term" className="input min-h-9 w-40 py-1 text-xs" aria-label="Term" />
          <select name="action" className="input min-h-9 w-28 py-1 text-xs" aria-label="Action"><option value="review">Review</option><option value="block">Block</option></select>
          <input name="reason" placeholder="Reason" className="input min-h-9 w-48 py-1 text-xs" aria-label="Reason" />
          <button className={smallPrimary}>Add term</button>
        </Op>
        <table className="w-full text-sm">
          <tbody>
            {(terms ?? []).map((t) => (
              <tr key={t.id} className="border-t border-line">
                <td className="py-2">{t.country_code ?? "All"}</td><td className="font-medium">{t.term}</td><td>{t.action}</td><td className="text-muted">{t.reason}</td>
                <td className="text-right"><Op op="term.delete" back={back}><input type="hidden" name="country" value={t.country_code ?? ""} /><input type="hidden" name="term" value={t.term} /><button className={small}>Delete</button></Op></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="h2">Policy pages</h2>
        {(policies ?? []).map((p) => (
          <Op key={p.id} op="policy.set" back={back} className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="kind" value={p.kind} /><input type="hidden" name="country" value={p.country_code ?? ""} />
            <p className="text-xs font-semibold uppercase text-muted">{p.kind.replace("_", " ")} · {p.country_code ?? "All markets"}</p>
            <input name="title" defaultValue={p.title} className="input" aria-label="Title" />
            <textarea name="body" defaultValue={p.body} rows={4} className="input" aria-label="Body" />
            <button className={smallPrimary}>Save policy</button>
          </Op>
        ))}
        <details><summary className="cursor-pointer text-sm font-semibold">Add a country-specific policy</summary>
          <Op op="policy.set" back={back} className="mt-2 space-y-2">
            <div className="flex gap-2"><CountrySel /><select name="kind" className="input min-h-9 py-1 text-xs" aria-label="Kind"><option value="prohibited_items">Prohibited items</option><option value="safety">Safety</option><option value="terms_addendum">Terms addendum</option><option value="privacy_addendum">Privacy addendum</option></select></div>
            <input name="title" required className="input" placeholder="Title" aria-label="Title" />
            <textarea name="body" required rows={4} className="input" placeholder="Policy text" aria-label="Body" />
            <button className={smallPrimary}>Add policy</button>
          </Op>
        </details>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="h2">Platform settings</h2>
        {(settings ?? []).map((s) => (
          <Op key={s.key} op="setting.set" back={back}>
            <input type="hidden" name="key" value={s.key} />
            <label className="w-48 text-sm font-medium">{s.key}</label>
            <input name="value" defaultValue={typeof s.value === "string" ? s.value : JSON.stringify(s.value)} className="input min-h-9 max-w-md py-1 text-sm" aria-label={s.key} />
            <button className={smallPrimary}>Save</button>
          </Op>
        ))}
      </section>
    </>
  );
}
