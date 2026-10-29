import Link from "next/link";
import { requireAdminOnly } from "@/lib/auth";
import { Op, Flash, small, smallPrimary } from "../ui";

export default async function Verifications({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdminOnly();
  const { data } = await supabase.from("seller_verifications").select("*, seller:seller_profiles(shop_name, slug, seller_type, business_name, business_registration_number, country_code)").order("created_at").limit(100);
  return (
    <>
      <h1 className="h1">Seller verification</h1>
      <Flash sp={sp} />
      <p className="text-sm text-muted">Approve only after checking the documents against the official business registry for that country (e.g. CAC in Nigeria, ORC in Ghana). Approval shows a &ldquo;Verified business&rdquo; badge; it is not a guarantee of the seller.</p>
      {!data?.length ? <p className="card p-6 text-center text-muted">No verification requests.</p> : (
        <ul className="space-y-3">
          {data.map((v) => (
            <li key={v.id} className="card space-y-1 p-4 text-sm">
              <p className="font-semibold"><Link className="link" href={`/s/${v.seller?.slug}`}>{v.seller?.shop_name}</Link> <span className="badge bg-cream text-brand-strong">{v.status}</span></p>
              <p>Business: {v.business_name ?? "—"} · Reg. no: {v.registration_number ?? "—"} · {v.seller?.country_code}</p>
              {v.notes && <p className="text-muted">{v.notes}</p>}
              {v.decision_note && <p className="text-xs">Decision: {v.decision_note}</p>}
              {v.status === "pending" && (
                <Op op="verification.review" back="/admin/verifications">
                  <input type="hidden" name="id" value={v.id} />
                  <input name="note" placeholder="Note to seller" className="input min-h-9 max-w-xs py-1 text-xs" aria-label="Note" />
                  <button name="approve" value="1" className={smallPrimary}>Approve</button>
                  <button name="approve" value="0" className={small}>Reject</button>
                </Op>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
