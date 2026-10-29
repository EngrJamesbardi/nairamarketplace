import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { DashboardNav } from "./nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { seller } = await requireSeller();
  return (
    <div className="page grid gap-6 md:grid-cols-[220px_1fr]">
      <aside>
        <div className="mb-3 rounded-xl bg-cream p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">Seller dashboard</p>
          <Link href={`/s/${seller.slug}`} className="font-bold hover:text-brand">{seller.shop_name}</Link>
        </div>
        <DashboardNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
