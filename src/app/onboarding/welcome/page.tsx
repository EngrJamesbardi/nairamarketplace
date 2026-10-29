import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { LogoMark } from "@/components/Logo";

export const metadata = { title: "Welcome" };

export default async function Welcome() {
  const { profile } = await requireUser();
  return (
    <div className="page flex max-w-xl flex-col items-center gap-4 py-12 text-center">
      <LogoMark size={64} />
      <h1 className="h1">Welcome, {profile?.display_name}!</h1>
      <p className="text-muted">Your email is verified. You can browse and buy straight away, and start selling whenever you like.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-secondary">Start browsing</Link>
        <Link href="/onboarding/seller" className="btn-primary">Set up a storefront</Link>
      </div>
    </div>
  );
}
