import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Payment status", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where providers send members back to. This page only READS the payment: credits and plans are granted
 * solely by the verified provider webhook, so a forged or replayed return URL changes nothing.
 */
export default async function PayReturn({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const { supabase } = await requireUser("/dashboard/credits");
  const { data: p } = ref ? await supabase.from("platform_payments").select("*").eq("reference", ref).maybeSingle() : { data: null };
  if (!p) {
    return (
      <div className="page max-w-md space-y-3">
        <h1 className="h1">Payment not found</h1>
        <Link className="btn-secondary" href="/dashboard/credits">Back to credits</Link>
      </div>
    );
  }
  const next = p.purpose === "credits" ? "/dashboard/credits" : p.purpose === "promotion" ? "/dashboard/promotions" : "/dashboard/plan";
  return (
    <div className="page max-w-md space-y-4">
      {p.status === "pending" && <meta httpEquiv="refresh" content="3" />}
      <div className="card space-y-3 p-6 text-center" data-testid="payment-status" data-status={p.status}>
        {p.status === "succeeded" ? (
          <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
        ) : p.status === "pending" ? (
          <Clock className="mx-auto size-12 text-warning" aria-hidden />
        ) : (
          <XCircle className="mx-auto size-12 text-danger" aria-hidden />
        )}
        <h1 className="h1">
          {p.status === "succeeded" ? "Payment confirmed" : p.status === "pending" ? "Waiting for confirmation" : "Payment not completed"}
        </h1>
        <p className="text-sm text-muted">
          {p.status === "succeeded"
            ? p.purpose === "credits" ? `${p.credits} credits have been added to your account.`
              : p.purpose === "promotion" ? `Your listing is promoted for ${p.promotion_days} days.` : "Your plan is active."
            : p.status === "pending"
              ? p.purpose === "promotion"
                ? "Your listing is already published. The promotion starts only after the payment provider confirms your payment. This page refreshes automatically."
                : "We add credits only after the payment provider confirms your payment. This page refreshes automatically."
              : `${p.failure_reason ?? "The payment was declined or cancelled. You have not been charged by us."}${p.purpose === "promotion" ? " Your listing is still published as a standard listing." : ""}`}
        </p>
        <p className="text-xs text-muted">{formatMoney(p.amount_minor, p.currency)} · ref {p.reference}</p>
        <Link className="btn-primary" href={next}>Continue</Link>
      </div>
    </div>
  );
}
