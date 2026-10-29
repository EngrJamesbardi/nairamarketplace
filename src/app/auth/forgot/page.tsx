import { AuthCard } from "@/components/AuthCard";
import { ForgotForm } from "./form";

export const metadata = { title: "Reset your password", robots: { index: false } };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      {error === "link" && (
        <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">
          That reset link is invalid, expired or was already used. Enter your email to get a new one.
        </p>
      )}
      <ForgotForm />
    </AuthCard>
  );
}
