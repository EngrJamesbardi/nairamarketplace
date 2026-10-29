import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EmptyState } from "@/components/ProductCard";
import { markAllNotificationsRead } from "@/app/actions/notifications";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const { supabase, user } = await requireUser("/notifications");
  const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  const unread = (data ?? []).some((n) => !n.read_at);
  return (
    <div className="page max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="h1">Notifications</h1>
        {unread && <form action={markAllNotificationsRead}><button className="btn-secondary">Mark all read</button></form>}
      </div>
      {!data?.length ? <EmptyState title="You're all caught up" /> : (
        <ul className="card divide-y divide-line">
          {data.map((n) => (
            <li key={n.id}>
              <Link href={n.link ?? "#"} className={`block p-3 hover:bg-cream/50 ${n.read_at ? "" : "bg-cream/40"}`}>
                <p className={`text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</p>
                {n.body && <p className="truncate text-sm text-muted">{n.body}</p>}
                <p className="text-xs text-muted">{new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Manage which notifications you get in <Link href="/account" className="link">account settings</Link>. Push notifications to your phone are not enabled yet.</p>
    </div>
  );
}
