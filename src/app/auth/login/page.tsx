import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "./form";
import { safeNextPath } from "@/lib/safe-path";

export const metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; verified?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to message sellers, make offers and manage your shop.">
      {sp.error === "link" && (
        <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">
          That link is invalid, expired or was already used. If you already verified your email, just sign in. Otherwise{" "}
          <Link href="/auth/check-email" className="link">request a new verification email</Link>.
        </p>
      )}
      <LoginForm next={next} />
      <p className="text-center text-sm text-muted">
        New here? <Link href={`/auth/register${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Create a free account</Link>
      </p>
      <p className="text-center text-sm text-muted">
        Didn&apos;t get your verification email? <Link href="/auth/check-email" className="link">Resend it</Link>
      </p>
    </AuthCard>
  );
}
