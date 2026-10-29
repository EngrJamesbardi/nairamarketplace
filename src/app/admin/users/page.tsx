import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Op, Flash, small, smallDanger } from "../ui";

type SP = { q?: string; status?: string; ok?: string; error?: string };

export default async function Users({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, roles, user: me } = await requireAdmin();
  const isAdmin = roles.includes("admin");
  const status = ["active", "suspended", "deactivated", "deleted"].includes(sp.status ?? "") ? (sp.status as "active") : undefined;
  const { data: users, error } = await supabase.rpc("admin_list_users", { p_query: sp.q || undefined, p_status: status, p_limit: 100 });
  const back = `/admin/users?q=${encodeURIComponent(sp.q ?? "")}`;
  return (
    <>
      <h1 className="h1">Users & sellers</h1>
      <Flash sp={sp} />
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Name, email or shop" className="input max-w-xs" aria-label="Search users" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[10rem]" aria-label="Status"><option value="">Any status</option><option>active</option><option>suspended</option><option>deactivated</option><option>deleted</option></select>
        <button className="btn-secondary">Search</button>
      </form>
      {error && <p className="text-danger">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Member</th><th className="font-medium">Shop</th><th className="font-medium">Status</th><th className="font-medium">Listings / reports</th><th className="font-medium">Actions</th></tr></thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-t border-line align-top" data-testid="user-row">
                <td className="p-3"><p className="font-medium">{u.display_name}</p><p className="text-xs text-muted">{u.email} · {u.country_code} · joined {new Date(u.created_at).toLocaleDateString("en-GB")}</p>{u.roles.length > 0 && <p className="text-xs font-semibold text-brand">{u.roles.join(", ")}</p>}</td>
                <td className="py-3">{u.shop_slug ? <Link className="link" href={`/s/${u.shop_slug}`}>{u.shop_name}</Link> : "—"}</td>
                <td className="py-3"><span className={`badge ${u.status === "active" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{u.status}</span>{u.suspended_reason && <p className="text-xs text-muted">{u.suspended_reason}</p>}</td>
                <td className="py-3">{u.listing_count} / {u.report_count}</td>
                <td className="space-y-1 py-3 pr-3">
                  {u.id !== me.id && u.status === "active" && (
                    <Op op="user.status" back={back}>
                      <input type="hidden" name="id" value={u.id} /><input type="hidden" name="status" value="suspended" />
                      <input name="reason" required placeholder="Reason" className="input min-h-9 w-28 py-1 text-xs" aria-label="Suspension reason" />
                      <input name="days" type="number" min={0} placeholder="Days" className="input min-h-9 w-16 py-1 text-xs" aria-label="Suspension days (blank = indefinite)" />
                      <button className={smallDanger}>Suspend</button>
                    </Op>
                  )}
                  {u.status === "suspended" && (
                    <Op op="user.status" back={back}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="status" value="active" /><button className={small}>Reinstate</button></Op>
                  )}
                  {isAdmin && u.id !== me.id && (
                    <Op op="user.role" back={back}>
                      <input type="hidden" name="id" value={u.id} /><input type="hidden" name="role" value="moderator" />
                      <button name="grant" value={u.roles.includes("moderator") ? "0" : "1"} className={small}>{u.roles.includes("moderator") ? "Remove moderator" : "Make moderator"}</button>
                    </Op>
                  )}
                  {isAdmin && u.shop_slug && (
                    <Op op="seller.feature" back={back}><input type="hidden" name="id" value={u.id} /><button name="featured" value="1" className={small}>Feature shop</button><button name="featured" value="0" className={small}>Unfeature</button></Op>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Administrator role grants are deliberately limited to existing administrators and are always audit-logged. Initial administrators are created with the bootstrap script (see docs).</p>
    </>
  );
}
