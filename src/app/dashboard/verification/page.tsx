import { BadgeCheck } from "lucide-react";
import { requireSeller } from "@/lib/auth";
import { VerificationForm } from "./form";

export const metadata = { title: "Business verification" };

export default async function Verification() {
  const { supabase, user, seller } = await requireSeller("/dashboard/verification");
  const { data: requests } = await supabase.from("seller_verifications").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
  const pending = requests?.some((r) => r.status === "pending");
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="h1">Business verification</h1>
      <p className="text-sm text-muted">
        Optional. Registered businesses can ask for a &ldquo;Verified business&rdquo; badge. Our team checks your details against the official
        business registry. Individuals selling personal items do not need this.
      </p>
      {seller.verification_status === "verified" ? (
        <p className="card flex items-center gap-2 p-4 font-semibold text-success"><BadgeCheck className="size-5" aria-hidden /> Your business is verified.</p>
      ) : pending ? (
        <p className="card p-4 text-sm">Your request is being reviewed. We&apos;ll notify you when there&apos;s a decision.</p>
      ) : (
        <VerificationForm defaults={{ businessName: seller.business_name ?? "", registrationNumber: seller.business_registration_number ?? "" }} />
      )}
      {(requests?.length ?? 0) > 0 && (
        <section>
          <h2 className="h2 mb-2">History</h2>
          <ul className="space-y-2 text-sm">
            {requests!.map((r) => (
              <li key={r.id} className="card p-3">
                {new Date(r.created_at).toLocaleDateString("en-GB")} · <span className="font-semibold">{r.status}</span>
                {r.decision_note && <span className="text-muted"> · {r.decision_note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
