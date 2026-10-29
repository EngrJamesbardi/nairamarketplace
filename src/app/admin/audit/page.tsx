import { requireAdminOnly } from "@/lib/auth";

export default async function Audit({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { supabase } = await requireAdminOnly();
  let q = supabase.from("admin_audit_logs").select("*, actor:profiles!admin_audit_logs_actor_id_fkey(display_name)").order("created_at", { ascending: false }).range((page - 1) * 50, page * 50 - 1);
  if (sp.action) q = q.ilike("action", `${sp.action}%`);
  const { data } = await q;
  return (
    <>
      <h1 className="h1">Audit log</h1>
      <p className="text-sm text-muted">Append-only. Entries cannot be edited or deleted, even by administrators.</p>
      <form className="flex gap-2"><input name="action" defaultValue={sp.action} placeholder="Filter by action prefix (e.g. listing., credits.)" className="input max-w-sm" aria-label="Action filter" /><button className="btn-secondary">Filter</button></form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">When</th><th className="font-medium">Who</th><th className="font-medium">Action</th><th className="font-medium">Target</th><th className="font-medium">Details</th></tr></thead>
          <tbody>
            {(data ?? []).map((l) => (
              <tr key={l.id} className="border-t border-line align-top" data-testid="audit-row">
                <td className="whitespace-nowrap p-3">{new Date(l.created_at).toLocaleString("en-GB")}</td>
                <td className="py-3">{l.actor?.display_name ?? "system"}</td>
                <td className="py-3 font-mono text-xs">{l.action}</td>
                <td className="py-3 text-xs">{l.target_type}:{l.target_id?.slice(0, 12)}</td>
                <td className="max-w-xs truncate py-3 font-mono text-xs" title={JSON.stringify(l.details)}>{JSON.stringify(l.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="flex gap-2">{page > 1 && <a className="btn-secondary" href={`?page=${page - 1}`}>Newer</a>}{(data?.length ?? 0) === 50 && <a className="btn-secondary" href={`?page=${page + 1}`}>Older</a>}</nav>
    </>
  );
}
