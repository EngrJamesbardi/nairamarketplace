import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { getMfaState, requireUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/roles";
import { EnrollAuthenticator } from "./enroll";
import { RemoveFactorForm } from "./remove";

export const metadata = { title: "Two-step verification", robots: { index: false } };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string; added?: string; removed?: string }> }) {
  const sp = await searchParams;
  const { roles } = await requireUser("/account/security");
  const mfa = await getMfaState();
  const staff = isStaffRole(roles);
  // Two-step verification is for staff accounts. Anyone who already has an authenticator can still manage it here.
  if (!staff && !mfa.factors.length) redirect("/account");
  const verified = mfa.level === "aal2";
  const canAdd = mfa.factors.length === 0 || verified;
  return (
    <div className="page max-w-2xl space-y-6">
      <div>
        <Link href="/account" className="link text-sm">← Account</Link>
        <h1 className="h1 mt-2">Two-step verification</h1>
        <p className="mt-1 text-sm text-muted">
          After your password, you&apos;ll enter a 6-digit code from an authenticator app such as Google Authenticator, Microsoft Authenticator, 1Password or Authy.
          {staff && " It is required to use Admin."}
        </p>
      </div>

      {sp.required === "admin" && !mfa.factors.length && (
        <p role="alert" className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm">
          Admin needs two-step verification. Set up an authenticator app below to continue.
        </p>
      )}
      {sp.added === "1" && <p role="status" className="rounded-lg bg-success/5 p-3 text-sm text-success">Authenticator added. You&apos;ll be asked for a code each time you sign in.</p>}
      {sp.removed === "1" && <p role="status" className="rounded-lg bg-success/5 p-3 text-sm text-success">Authenticator removed.</p>}

      <section className="card space-y-3 p-5">
        <h2 className="h2 flex items-center gap-2">
          {mfa.factors.length ? <ShieldCheck className="size-5 text-success" aria-hidden /> : <ShieldAlert className="size-5 text-danger" aria-hidden />}
          {mfa.factors.length ? "On" : "Off"}
        </h2>
        {mfa.factors.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Your authenticators">
            {mfa.factors.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3" data-testid="factor-item">
                <div>
                  <p className="font-medium">{f.friendly_name || "Authenticator app"}</p>
                  <p className="text-xs text-muted">Added {fmt(f.created_at)}</p>
                </div>
                {verified ? (
                  <RemoveFactorForm id={f.id} name={f.friendly_name || "Authenticator app"} needsTyped={staff && mfa.factors.length === 1} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {mfa.factors.length > 0 && !verified && (
          <p className="text-sm">
            To add or remove an authenticator, first <Link className="link" href="/auth/mfa?next=/account/security">confirm a code</Link>.
          </p>
        )}
        {mfa.factors.length === 1 && verified && (
          <p className="text-sm text-muted">Tip: add a second authenticator (another phone or a password manager) so losing one device doesn&apos;t lock you out.</p>
        )}
      </section>

      {canAdd && mfa.factors.length < 5 && (
        <section className="card space-y-3 p-5">
          <h2 className="h2">{mfa.factors.length ? "Add a backup authenticator" : "Set up an authenticator app"}</h2>
          <EnrollAuthenticator defaultName={mfa.factors.length ? "Backup authenticator" : "Authenticator app"} existingNames={mfa.factors.map((f) => f.friendly_name ?? "")} />
        </section>
      )}
    </div>
  );
}
