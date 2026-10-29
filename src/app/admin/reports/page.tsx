import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Op, Flash, small, smallPrimary, smallDanger } from "../ui";

type SP = { status?: string; ok?: string; error?: string };

export default async function Reports({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const { supabase } = await requireAdmin();
  let q = supabase.from("reports").select("*, listing:listings(id, title, moderation_status), reported:profiles!reports_reported_user_id_fkey(id, display_name, status), reporter:profiles!reports_reporter_id_fkey(display_name), message:messages(body)").order("created_at", { ascending: true }).limit(100);
  q = status === "open" ? q.in("status", ["open", "reviewing"]) : q.in("status", ["resolved", "dismissed"]);
  const { data: reports } = await q;
  const back = `/admin/reports?status=${status}`;
  return (
    <>
      <h1 className="h1">Reports & complaints</h1>
      <Flash sp={sp} />
      <nav className="flex gap-2">
        <Link href="/admin/reports" className={`chip ${status === "open" ? "chip-active" : ""}`}>Open</Link>
        <Link href="/admin/reports?status=closed" className={`chip ${status !== "open" ? "chip-active" : ""}`}>Closed</Link>
      </nav>
      <p className="text-xs text-muted">Oldest first. Each action is written to the moderation and audit logs.</p>
      {!reports?.length ? <p className="card p-6 text-center text-muted">No reports.</p> : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="card space-y-2 p-4" data-testid="report-item">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="badge bg-danger/10 text-danger">{r.reason.replaceAll("_", " ")}</span>
                <span className="badge bg-cream text-brand-strong">{r.status}</span>
                <span className="text-muted">{r.target_type} · reported by {r.reporter?.display_name ?? "deleted user"} · {new Date(r.created_at).toLocaleString("en-GB")}</span>
              </div>
              {r.listing && <p className="text-sm">Listing: <Link className="link" href={`/listing/${r.listing.id}`}>{r.listing.title}</Link> ({r.listing.moderation_status})</p>}
              {r.reported && <p className="text-sm">Member: <Link className="link" href={`/admin/users?q=${encodeURIComponent(r.reported.display_name)}`}>{r.reported.display_name}</Link> ({r.reported.status})</p>}
              {r.message && <blockquote className="rounded bg-canvas p-2 text-sm">&ldquo;{r.message.body}&rdquo;</blockquote>}
              {r.details && <p className="text-sm text-muted">Details: {r.details}</p>}
              {r.resolution_note && <p className="text-xs">Resolution: {r.resolution_note}</p>}
              {status === "open" && (
                <div className="flex flex-wrap gap-2">
                  {r.listing && r.listing.moderation_status !== "removed" && (
                    <Op op="listing.moderate" back={back}>
                      <input type="hidden" name="id" value={r.listing.id} /><input type="hidden" name="report" value={r.id} />
                      <input type="hidden" name="reason" value={`Removed after report: ${r.reason.replaceAll("_", " ")}`} />
                      <button name="action" value="remove" className={smallDanger}>Remove listing</button>
                    </Op>
                  )}
                  {r.reported && r.reported.status === "active" && (
                    <Op op="user.status" back={back}>
                      <input type="hidden" name="id" value={r.reported.id} /><input type="hidden" name="status" value="suspended" />
                      <input type="hidden" name="reason" value={`Suspended after report: ${r.reason.replaceAll("_", " ")}`} />
                      <button className={smallDanger}>Suspend member</button>
                    </Op>
                  )}
                  <Op op="report.resolve" back={back}>
                    <input type="hidden" name="id" value={r.id} />
                    <input name="note" placeholder="Resolution note" className="input min-h-9 max-w-xs py-1 text-xs" aria-label="Resolution note" />
                    <button name="status" value="resolved" className={smallPrimary}>Resolve</button>
                    <button name="status" value="dismissed" className={small}>Dismiss</button>
                  </Op>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
