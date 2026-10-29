import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProvider } from "@/lib/payments";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Mock checkout", robots: { index: false } };

/** Stand-in for a provider's hosted payment page. Exists only while the mock provider is enabled. */
export default async function MockCheckout({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!getProvider("mock")) notFound();
  const { supabase } = await requireUser(`/pay/mock/${reference}`);
  const { data: p } = await supabase.from("platform_payments").select("*").eq("reference", reference).maybeSingle();
  if (!p || p.provider !== "mock") notFound();
  return (
    <div className="page max-w-md space-y-4">
      <div role="note" className="flex gap-2 rounded-xl border-2 border-dashed border-warning bg-warning/10 p-3 text-sm text-ink">
        <FlaskConical className="size-5 shrink-0" aria-hidden />
        <p><strong>Development mock checkout.</strong> No real money moves. In production this page is replaced by the payment provider&apos;s own checkout.</p>
      </div>
      <div className="card space-y-2 p-5">
        <p className="text-sm text-muted">Paying Naira Marketplace</p>
        <p className="text-3xl font-extrabold">{formatMoney(p.amount_minor, p.currency)}</p>
        <p className="text-sm">{p.purpose === "credits" ? `${p.credits} promotion credits` : "Seller plan"}</p>
        <p className="text-xs text-muted">Reference {p.reference} · status {p.status}</p>
      </div>
      {p.status === "pending" ? (
        <form action={`/pay/mock/${encodeURIComponent(reference)}/simulate`} method="post" className="flex flex-wrap gap-2">
          <button name="outcome" value="success" className="btn-primary">Simulate successful payment</button>
          <button name="outcome" value="failed" className="btn-secondary">Simulate declined payment</button>
        </form>
      ) : (
        <a className="btn-secondary" href={`/pay/return?ref=${encodeURIComponent(reference)}`}>See payment status</a>
      )}
    </div>
  );
}
