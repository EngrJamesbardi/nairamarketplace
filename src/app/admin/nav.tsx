"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/admin", "Overview", false],
  ["/admin/listings", "Listing moderation", false],
  ["/admin/reports", "Reports", false],
  ["/admin/users", "Users & sellers", false],
  ["/admin/verifications", "Seller verification", true],
  ["/admin/countries", "Countries", true],
  ["/admin/categories", "Categories", true],
  ["/admin/policies", "Policies & settings", true],
  ["/admin/monetisation", "Credits & packages", true],
  ["/admin/campaigns", "Promotion campaigns", true],
  ["/admin/plans", "Subscription plans", true],
  ["/admin/payments", "Payments & revenue", true],
  ["/admin/audit", "Audit log", true],
] as const;

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
      {items.filter(([, , adminOnly]) => isAdmin || !adminOnly).map(([href, label]) => {
        const active = href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center rounded-xl px-3 text-sm font-medium ${active ? "bg-cream text-brand-strong" : "hover:bg-cream/60"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
