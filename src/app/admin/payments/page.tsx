import { requireAdminOnly } from "@/lib/auth";
import { formatMoney } from "@/lib/money";

type Revenue = {
  by_currency: { currency: string; purpose: string; payments: number; amount_minor: number }[];
  last_30_days: { currency: string; payments: number; amount_minor: number }[];
  by_status: Record<string, number>;
  credits_outstanding: number; credits_spent: number; active_campaigns: number; active_subscriptions: number; ledger_mismatches: number;
};

export default async function Payments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdminOnly();
  let q = supabase.from("platform_payments").select("*, member:profiles!platform_payments_user_id_fkey(display_name)").order("created_at", { ascending: false }).limit(100);
  if (sp.status) q = q.eq("status", sp.status as "pending");
  const [{ data: rev }, { data: payments }, { data: events }] = await Promise.all([
    supabase.rpc("admin_revenue"),
    q,
    supabase.from("payment_events").select("*").order("received_at", { ascending: false }).limit(20),
  ]);
  const r = rev as unknown as Revenue | null;
  return (
    <>
      <h1 className="h1">Payments & revenue</h1>
      <p className="text-sm text-muted">Platform revenue from optional services (credits and plans). Totals are per currency and never converted. Mock-provider payments are development test data, not revenue.</p>
      {r && (
        <>
          {r.ledger_mismatches > 0 && <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm font-semibold text-danger">{r.ledger_mismatches} credit account(s) do not reconcile with the ledger. Investigate before taking more payments.</p>}
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {r.by_currency.length === 0 && <li className="card p-4 text-sm text-muted">No completed payments yet.</li>}
            {r.by_currency.map((x) => (
              <li key={x.currency + x.purpose} className="card p-4"><p className="text-sm text-muted">{x.purpose} · {x.currency}</p><p className="text-xl font-bold">{formatMoney(x.amount_minor, x.currency)}</p><p className="text-xs text-muted">{x.payments} payments</p></li>
            ))}
            <li className="card p-4"><p className="text-sm text-muted">Credits outstanding</p><p className="text-xl font-bold">{r.credits_outstanding}</p><p className="text-xs text-muted">{r.credits_spent} spent on promotions</p></li>
            <li className="card p-4"><p className="text-sm text-muted">Running promotions</p><p className="text-xl font-bold">{r.active_campaigns}</p></li>
            <li className="card p-4"><p className="text-sm text-muted">Active plans</p><p className="text-xl font-bold">{r.active_subscriptions}</p></li>
            <li className="card p-4"><p className="text-sm text-muted">Payments by status</p><p className="text-xs">{Object.entries(r.by_status).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</p></li>
          </ul>
        </>
      )}
      <form className="flex gap-2"><select name="status" defaultValue={sp.status ?? ""} className="input max-w-xs" aria-label="Status"><option value="">All statuses</option><option>pending</option><option>succeeded</option><option>failed</option><option>cancelled</option><option>refunded</option></select><button className="btn-secondary">Filter</button></form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Date</th><th className="font-medium">Member</th><th className="font-medium">Reference</th><th className="font-medium">For</th><th className="font-medium">Amount</th><th className="font-medium">Provider</th><th className="font-medium">Status</th></tr></thead>
          <tbody>
            {(payments ?? []).map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="p-3">{new Date(p.created_at).toLocaleString("en-GB")}</td>
                <td>{p.member?.display_name}</td>
                <td className="font-mono text-xs">{p.reference}</td>
                <td>{p.purpose}{p.credits ? ` (${p.credits})` : ""}</td>
                <td>{formatMoney(p.amount_minor, p.currency)}</td>
                <td>{p.provider}</td>
                <td title={p.failure_reason ?? undefined}>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card overflow-x-auto p-4">
        <h2 className="h2 mb-2">Recent provider callbacks</h2>
        <table className="w-full min-w-[600px] text-xs">
          <tbody>
            {(events ?? []).map((e) => (
              <tr key={e.id} className="border-t border-line"><td className="py-1">{new Date(e.received_at).toLocaleString("en-GB")}</td><td>{e.provider}</td><td>{e.event_type}</td><td className="font-mono">{e.reference}</td><td className={e.signature_valid ? "" : "text-danger"}>{e.signature_valid ? "signed" : "INVALID SIGNATURE"}</td><td>{e.result}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
