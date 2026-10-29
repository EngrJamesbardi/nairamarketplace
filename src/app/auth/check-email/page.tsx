import { AuthCard } from "@/components/AuthCard";

export const metadata = { title: "Check your email", robots: { index: false } };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthCard title="Check your email" subtitle="We sent you a verification link.">
      <p className="text-center text-sm">
        Open the link we sent{email ? <> to <strong>{email}</strong></> : null} to verify your email address and finish creating your
        account. The link expires after a while; you can request another by signing up again.
      </p>
    </AuthCard>
  );
}
