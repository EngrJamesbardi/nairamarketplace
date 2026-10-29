import Link from "next/link";
import { Bell, MessageCircle, Plus, User, LayoutDashboard, Shield } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SearchBar } from "@/components/SearchBar";
import { CountrySelect } from "@/components/CountrySelect";
import { getSession } from "@/lib/auth";
import { getActiveCountries, getSelectedCountry } from "@/lib/market";
import { getUnreadCounts } from "@/lib/unread";

export async function Header() {
  const [session, countries, country] = await Promise.all([getSession(), getActiveCountries(), getSelectedCountry()]);
  const unread = session.user ? await getUnreadCounts(session.user.id) : { messages: 0, notifications: 0 };
  const isStaff = session.roles.includes("admin") || session.roles.includes("moderator");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Logo />
        <SearchBar className="hidden flex-1 md:block" />
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <div className="hidden sm:block">
            <CountrySelect countries={countries} current={country.code} />
          </div>
          <div className="sm:hidden">
            <CountrySelect countries={countries} current={country.code} compact />
          </div>
          {session.user ? (
            <>
              <IconLink href="/notifications" label="Notifications" count={unread.notifications}>
                <Bell className="size-5" />
              </IconLink>
              <IconLink href="/messages" label="Messages" count={unread.messages} className="hidden md:inline-flex">
                <MessageCircle className="size-5" />
              </IconLink>
              {isStaff && (
                <IconLink href="/admin" label="Admin" className="hidden md:inline-flex">
                  <Shield className="size-5" />
                </IconLink>
              )}
              <IconLink href="/dashboard" label="Seller dashboard" className="hidden md:inline-flex">
                <LayoutDashboard className="size-5" />
              </IconLink>
              <IconLink href="/account" label="Account" className="hidden md:inline-flex">
                <User className="size-5" />
              </IconLink>
            </>
          ) : (
            <Link href="/auth/login" className="btn-ghost hidden md:inline-flex">
              Sign in
            </Link>
          )}
          <Link href="/sell" className="btn-primary hidden md:inline-flex">
            <Plus className="size-4" aria-hidden /> Sell
          </Link>
        </div>
      </div>
      <div className="px-4 pb-2.5 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}

function IconLink({
  href,
  label,
  count = 0,
  className = "",
  children,
}: {
  href: string;
  label: string;
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // Display is set by exactly one utility: "inline-flex" alongside "hidden" would win on phones and overflow the header.
      className={`relative size-11 items-center justify-center rounded-xl text-ink hover:bg-cream hover:text-brand ${className.includes("hidden") ? className : `inline-flex ${className}`}`}
    >
      {children}
      <span className="sr-only">{label}</span>
      {count > 0 && (
        <span className="absolute right-1 top-1 min-w-5 rounded-full bg-brand px-1 text-center text-[11px] font-bold leading-5 text-on-brand">
          {count > 99 ? "99+" : count}
          <span className="sr-only"> unread</span>
        </span>
      )}
    </Link>
  );
}
