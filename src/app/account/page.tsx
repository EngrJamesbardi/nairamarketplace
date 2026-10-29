import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut, Store, Heart, Users, Bell, Shield } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCountries } from "@/lib/market";
import { signOut } from "@/app/actions/auth";
import { ProfileForm, PreferencesForm } from "./forms";
import { PrivacySection } from "./privacy";
import { SignOutButton } from "./signout";

export const metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, profile, seller, roles } = await requireUser("/account");
  const [countries, { data: regions }] = await Promise.all([getCountries(), supabase.from("regions").select("id, name, country_code").order("name")]);
  const theme = (await cookies()).get("nm_theme")?.value ?? "light";
  return (
    <div className="page max-w-3xl space-y-6">
      <h1 className="h1">Your account</h1>
      {sp.password === "updated" && <p role="status" className="rounded-lg bg-success/5 p-3 text-sm text-success">Your password was updated.</p>}
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Account shortcuts">
        <Link className="card flex min-h-16 items-center gap-2 p-3 text-sm font-medium hover:border-brand" href={seller ? "/dashboard" : "/onboarding/seller"}><Store className="size-5 text-brand" aria-hidden />{seller ? "Seller dashboard" : "Start selling"}</Link>
        <Link className="card flex min-h-16 items-center gap-2 p-3 text-sm font-medium hover:border-brand" href="/favourites"><Heart className="size-5 text-brand" aria-hidden />Saved items</Link>
        <Link className="card flex min-h-16 items-center gap-2 p-3 text-sm font-medium hover:border-brand" href="/following"><Users className="size-5 text-brand" aria-hidden />Following</Link>
        <Link className="card flex min-h-16 items-center gap-2 p-3 text-sm font-medium hover:border-brand" href="/notifications"><Bell className="size-5 text-brand" aria-hidden />Notifications</Link>
        {roles.length > 0 && <Link className="card flex min-h-16 items-center gap-2 p-3 text-sm font-medium hover:border-brand" href="/admin"><Shield className="size-5 text-brand" aria-hidden />Admin</Link>}
      </nav>
      <section className="card space-y-3 p-5">
        <h2 className="h2">Profile</h2>
        <p className="text-sm text-muted">Signed in as {user.email}</p>
        <ProfileForm profile={profile!} countries={countries.filter((c) => c.is_active || c.code === profile?.country_code)} regions={regions ?? []} />
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="h2">Notifications & appearance</h2>
        <PreferencesForm prefs={(profile?.notification_prefs ?? {}) as Record<string, boolean>} theme={theme} />
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="h2">Security</h2>
        <Link href="/auth/forgot" className="link text-sm">Change password (we&apos;ll email you a link)</Link>
        <Link href="/account/blocked" className="link block text-sm">Blocked members</Link>
      </section>
      <PrivacySection />
      <form action={signOut}><SignOutButton><LogOut className="size-4" aria-hidden /> Sign out</SignOutButton></form>
    </div>
  );
}
