import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { getMfaState, requireUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-path";
import { MfaForm } from "./form";

export const metadata = { title: "Enter your code", robots: { index: false } };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  await requireUser(`/auth/mfa?next=${encodeURIComponent(next)}`);
  const mfa = await getMfaState();
  if (mfa.level === "aal2") redirect(next);
  if (!mfa.factors.length) redirect("/account/security");
  return (
    <AuthCard title="Two-step verification" subtitle="Open your authenticator app and enter the 6-digit code for Naira Marketplace.">
      <MfaForm next={next} factors={mfa.factors.map((f) => ({ id: f.id, name: f.friendly_name || "Authenticator app" }))} />
      <p className="text-center text-xs text-muted">
        Lost your authenticator? Use your backup authenticator if you set one up. Otherwise the site owner can reset it for you; see
        &ldquo;Lost authenticator&rdquo; in the admin guide.
      </p>
    </AuthCard>
  );
}
