import Link from "next/link";
import { Coins } from "lucide-react";
import { requireSeller } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getProvider } from "@/lib/payments";

export const metadata = { title: "Credits" };

const KIND: Record<string, string> = {
  purchase: "Purchase", subscription_grant: "Plan credits", promotion_spend: "Promotion", promotion_refund: "Refund",
  admin_grant: "Adjustment", admin_debit: "Adjustment",
};

export default async function Credits({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, seller } = await requireSeller("/dashboard/credits");
  const [{ data: balance }, { data: packages }, { data: txs }, { data: payments }, { data: country }] = await Promise.all([
    supabase.rpc("my_credit_balance"),
    supabase.from("credit_packages").select("*").eq("country_code", seller.country_code).eq("is_active", true).order("sort_order"),
    supabase.from("credit_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("platform_payments").select("reference, status, amount_minor, currency, purpose, created_at, failure_reason").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("countries").select("name, payment_provider").eq("code", seller.country_code).single(),
  ]);
  const provider = getProvider(country?.payment_provider);
  return (
    <div className="space-y-6">
      <h1 className="h1">Promotion credits</h1>
      {sp.error && <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">{sp.error}</p>}
      <div className="flex items-center gap-3 rounded-2xl bg-cream p-5">
        <Coins className="size-8 text-brand" aria-hidden />
        <div>
          <p className="text-sm text-muted">Your balance</p>
          <p className="text-3xl font-extrabold" data-testid="credit-balance">{balance ?? 0} credits</p>
        </div>
        <Link href="/dashboard/promotions" className="btn-primary ml-auto">Promote a listing</Link>
      </div>
      <p className="text-sm text-muted">
        Credits are optional. They pay for sponsored placement of your listings. Listing, messaging and selling are free, and we never take a
        commission on your sales. Credits don&apos;t expire and can&apos;t be exchanged for cash.
      </p>

      <section aria-labelledby="buy-h" className="space-y-3">
        <h2 id="buy-h" className="h2">Buy credits</h2>
        {provider?.key === "mock" && <p className="rounded-lg border border-warning bg-warning/10 px-3 py-2 text-xs font-semibold text-ink">Payments in this environment use a development mock. No real money is taken.</p>}
        {!provider ? (
          <p className="card p-4 text-sm">Buying credits is not available in {country?.name} yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {(packages ?? []).map((p) => (
              <li key={p.id} className="card flex flex-col gap-2 p-4">
                <p className="font-semibold">{p.name}</p>
                <p className="text-2xl font-bold">{p.credits} credits</p>
                <p className="text-muted">{formatMoney(p.price_minor, p.currency)}</p>
                <form action="/pay/start" method="post" className="mt-auto">
                  <input type="hidden" name="purpose" value="credits" />
                  <input type="hidden" name="item" value={p.id} />
                  <input type="hidden" name="back" value="/dashboard/credits" />
                  <button className="btn-primary w-full">Buy {p.name}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="hist-h" className="card overflow-x-auto p-4">
        <h2 id="hist-h" className="h2 mb-2">History</h2>
        {!txs?.length ? <p className="text-sm text-muted">No credit activity yet.</p> : (
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Date</th><th className="font-medium">Type</th><th className="font-medium">Details</th><th className="text-right font-medium">Credits</th><th className="text-right font-medium">Balance</th></tr></thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-t border-line" data-testid="credit-tx">
                  <td className="py-2">{new Date(t.created_at).toLocaleDateString("en-GB")}</td>
                  <td>{KIND[t.kind] ?? t.kind}</td>
                  <td className="text-muted">{t.description}</td>
                  <td className={`text-right font-semibold ${t.delta > 0 ? "text-success" : ""}`}>{t.delta > 0 ? `+${t.delta}` : t.delta}</td>
                  <td className="text-right">{t.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(payments?.length ?? 0) > 0 && (
        <section className="card p-4 text-sm">
          <h2 className="h2 mb-2">Payments</h2>
          <ul className="space-y-1">
            {payments!.map((p) => (
              <li key={p.reference} className="flex flex-wrap justify-between gap-2 border-t border-line py-1">
                <span>{new Date(p.created_at).toLocaleDateString("en-GB")} · {p.purpose} · {formatMoney(p.amount_minor, p.currency)}</span>
                <span className={p.status === "succeeded" ? "text-success" : p.status === "pending" ? "text-warning" : "text-danger"}>{p.status}{p.failure_reason ? ` (${p.failure_reason})` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
