import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { DashboardNav } from "./nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { seller } = await requireSeller();
  return (
    <div className="page grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="min-w-0">
        <div className="mb-3 rounded-xl bg-cream p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">Seller dashboard</p>
          <Link href={`/s/${seller.slug}`} className="font-bold hover:text-brand">{seller.shop_name}</Link>
        </div>
        <DashboardNav />
      </aside>
      <div className="min-w-0 space-y-4">
        {seller.shop_status !== "active" && (
          <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">
            <strong>Your shop is {seller.shop_status}.</strong> It and its listings are hidden from buyers, and new listings cannot be published.
            {seller.shop_status_reason ? ` Reason: ${seller.shop_status_reason}` : ""} If you think this is a mistake, use our{" "}
            <Link className="link" href="/legal/complaints">complaints process</Link>.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
