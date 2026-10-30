import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { ResendForm } from "./resend-form";

export const metadata = { title: "Check your email", robots: { index: false } };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthCard title="Check your email" subtitle="We sent you a verification link.">
      <p className="text-center text-sm">
        Open the link we sent{email ? <> to <strong>{email}</strong></> : null} to verify your email address and finish creating your
        account. The link works for 1 hour and only once.
      </p>
      <p className="text-center text-sm text-muted">
        Already verified this email before? <Link href="/auth/login" className="link">Sign in</Link> or{" "}
        <Link href="/auth/forgot" className="link">reset your password</Link>.
      </p>
      <ResendForm email={email} />
    </AuthCard>
  );
}
