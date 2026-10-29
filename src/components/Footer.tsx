import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { getSetting } from "@/lib/market";

export async function Footer() {
  const tagline = await getSetting<string>("tagline", "Africa's Open Market. Your Deals, Your Way.");
  return (
    <footer className="mt-10 border-t border-line bg-surface pb-24 md:pb-6">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2">
            <LogoMark size={28} />
            <span className="font-bold">Naira Marketplace</span>
          </div>
          <p className="mt-2 text-sm text-muted">{tagline}</p>
          <p className="mt-3 max-w-md text-xs text-muted">
            Naira Marketplace is a meeting place. Buyers and sellers agree payment, delivery and collection directly. We do not
            hold product payments, deliver items or guarantee any seller, product, payment or delivery.
          </p>
        </div>
        <nav aria-label="Help" className="text-sm">
          <p className="mb-2 font-semibold">Help & policies</p>
          <ul className="space-y-1.5">
            <li><Link className="link" href="/legal/safety">Trading safely</Link></li>
            <li><Link className="link" href="/legal/prohibited">Prohibited items</Link></li>
            <li><Link className="link" href="/legal/terms">Terms of use</Link></li>
            <li><Link className="link" href="/legal/privacy">Privacy policy</Link></li>
            <li><Link className="link" href="/legal/complaints">Complaints</Link></li>
          </ul>
        </nav>
        <nav aria-label="Marketplace" className="text-sm">
          <p className="mb-2 font-semibold">Marketplace</p>
          <ul className="space-y-1.5">
            <li><Link className="link" href="/sell">Start selling</Link></li>
            <li><Link className="link" href="/search">Browse all</Link></li>
            <li><Link className="link" href="/pricing">Optional seller tools</Link></li>
            <li><Link className="link" href="/install">Install the app</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
