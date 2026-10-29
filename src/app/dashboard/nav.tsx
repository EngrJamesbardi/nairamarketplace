"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Package, MessageCircle, HandCoins, Coins, Megaphone, Crown, Store, Plus, BadgeCheck } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Overview", icon: BarChart3, exact: true },
  { href: "/dashboard/listings", label: "Listings", icon: Package },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/dashboard/offers", label: "Offers", icon: HandCoins },
  { href: "/dashboard/credits", label: "Credits", icon: Coins },
  { href: "/dashboard/promotions", label: "Promotions", icon: Megaphone },
  { href: "/dashboard/plan", label: "Plan", icon: Crown },
  { href: "/dashboard/verification", label: "Verification", icon: BadgeCheck },
  { href: "/onboarding/seller", label: "Storefront settings", icon: Store },
];

export function DashboardNav() {
  const path = usePathname();
  return (
    <nav aria-label="Seller dashboard" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
      <Link href="/dashboard/listings/new" className="btn-primary mb-2 hidden md:inline-flex"><Plus className="size-4" aria-hidden /> New listing</Link>
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium ${active ? "bg-cream text-brand-strong" : "text-ink hover:bg-cream/60"}`}>
            <Icon className="size-4" aria-hidden /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
