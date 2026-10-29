import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./nav";

export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireAdmin();
  return (
    <div className="page grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="min-w-0">
        <div className="mb-3 rounded-xl bg-ink p-3 text-canvas">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber">Administration</p>
          <p className="text-sm">{roles.includes("admin") ? "Administrator" : "Moderator"}</p>
        </div>
        <AdminNav isAdmin={roles.includes("admin")} />
        <Link href="/" className="link mt-3 hidden text-sm md:block">← Back to marketplace</Link>
      </aside>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}
