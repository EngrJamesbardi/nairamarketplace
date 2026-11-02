import Link from "next/link";
import { requireAdminOnly } from "@/lib/auth";
import { Op, Flash, small, smallDanger } from "../ui";

type SP = { q?: string; status?: string; ok?: string; error?: string };
const STATUSES = ["active", "suspended", "closed", "deleted"] as const;

const badge: Record<string, string> = {
  active: "bg-success/10 text-success",
  suspended: "bg-warning/15 text-warning",
  closed: "bg-danger/10 text-danger",
  deleted: "bg-ink/10 text-muted",
};

export default async function Shops({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdminOnly();
  const status = STATUSES.find((s) => s === sp.status);
  let q = supabase
    .from("seller_profiles")
    .select("user_id, shop_name, slug, shop_status, shop_status_reason, shop_status_changed_at, is_seed, is_featured, country_code, city, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("shop_status", status);
  if (sp.q) q = q.ilike("shop_name", `%${sp.q}%`);
  const { data: shops, error } = await q;
  const ids = (shops ?? []).map((s) => s.user_id);
  const { data: listings } = ids.length ? await supabase.from("listings").select("seller_id").in("seller_id", ids) : { data: [] };
  const counts = new Map<string, number>();
  for (const l of listings ?? []) counts.set(l.seller_id, (counts.get(l.seller_id) ?? 0) + 1);
  const back = `/admin/shops?q=${encodeURIComponent(sp.q ?? "")}${status ? `&status=${status}` : ""}`;

  return (
    <>
      <h1 className="h1">Shops</h1>
      <Flash sp={sp} />
      <p className="text-sm text-muted">
        Suspending or closing a shop hides it and all its listings from the public and stops new listings; the owner can still sign in and buy.
        Reinstate undoes either. Deleting a shop permanently deletes its listings and photos and clears its details; the owner&apos;s member account is
        kept (manage it on <Link className="link" href="/admin/users">Users &amp; sellers</Link>).
      </p>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Shop name" className="input max-w-xs" aria-label="Search shops" />
        <select name="status" defaultValue={status ?? ""} className="input max-w-[10rem]" aria-label="Shop status">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-secondary">Search</button>
      </form>
      {error && <p className="text-danger">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Shop</th><th className="font-medium">Status</th><th className="font-medium">Listings</th><th className="font-medium">Actions</th></tr></thead>
          <tbody>
            {(shops ?? []).map((s) => (
              <tr key={s.user_id} className="border-t border-line align-top" data-testid="shop-row">
                <td className="p-3">
                  {s.shop_status === "active" ? <Link className="link font-medium" href={`/s/${s.slug}`}>{s.shop_name}</Link> : <p className="font-medium">{s.shop_name}</p>}
                  <p className="text-xs text-muted">{s.country_code}{s.city ? ` · ${s.city}` : ""} · opened {new Date(s.created_at).toLocaleDateString("en-GB")}</p>
                  {s.is_seed && <span className="badge bg-ink/80 text-canvas">Demo</span>}
                </td>
                <td className="py-3">
                  <span className={`badge ${badge[s.shop_status] ?? ""}`}>{s.shop_status}</span>
                  {s.shop_status_reason && <p className="text-xs text-muted">{s.shop_status_reason}</p>}
                </td>
                <td className="py-3">{counts.get(s.user_id) ?? 0}</td>
                <td className="space-y-1 py-3 pr-3">
                  {s.shop_status !== "deleted" && s.shop_status !== "active" && (
                    <Op op="shop.status" back={back}>
                      <input type="hidden" name="id" value={s.user_id} /><input type="hidden" name="status" value="active" />
                      <button className={small}>Reinstate shop</button>
                    </Op>
                  )}
                  {(s.shop_status === "active" || s.shop_status === "suspended") && (
                    <Op op="shop.status" back={back}>
                      <input type="hidden" name="id" value={s.user_id} />
                      <input name="reason" required minLength={3} placeholder="Reason" className="input min-h-9 w-32 py-1 text-xs" aria-label="Reason" />
                      {s.shop_status === "active" && <button name="status" value="suspended" className={smallDanger}>Suspend shop</button>}
                      <button name="status" value="closed" className={smallDanger}>Close shop</button>
                    </Op>
                  )}
                  {s.shop_status !== "deleted" && (
                    <details className="rounded-lg border border-danger/40 p-2">
                      <summary className="cursor-pointer text-xs font-semibold text-danger">Delete permanently…</summary>
                      <p className="my-1 text-xs text-muted">Cannot be undone. Deletes all {counts.get(s.user_id) ?? 0} listing(s) and their photos and clears the shop&apos;s details. Conversations, offers, reviews and payments are kept.</p>
                      <Op op="shop.delete" back={back}>
                        <input type="hidden" name="id" value={s.user_id} />
                        <input name="reason" required minLength={3} placeholder="Reason" className="input min-h-9 w-32 py-1 text-xs" aria-label="Reason for deletion" />
                        <input name="confirm" required pattern="DELETE" placeholder="Type DELETE" className="input min-h-9 w-24 py-1 text-xs" aria-label="Type DELETE to confirm" />
                        <button className={smallDanger}>Delete shop</button>
                      </Op>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
