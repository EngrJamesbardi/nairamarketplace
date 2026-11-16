"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordFactorAdded } from "@/app/actions/mfa";

type Pending = { factorId: string; qr: string; secret: string };

/**
 * Enrolment runs in the browser, straight against Supabase Auth: the QR code and setup key are shown here only and are
 * never sent to this app's server, logged or stored by it.
 */
export function EnrollAuthenticator({ defaultName, existingNames }: { defaultName: string; existingNames: string[] }) {
  const [name, setName] = useState(defaultName);
  const [pending, setPending] = useState<Pending | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    const friendlyName = name.trim();
    if (friendlyName.length < 2 || friendlyName.length > 40) return setError("Give the authenticator a name (2 to 40 characters).");
    if (existingNames.some((n) => n.toLowerCase() === friendlyName.toLowerCase())) return setError("You already have an authenticator with that name. Choose another name.");
    setBusy(true);
    const supabase = createClient();
    // Clear any set-up that was started earlier but never confirmed, so it can't block this one.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName, issuer: "Naira Marketplace" });
    setBusy(false);
    if (err || !data) return setError("We couldn't start the set-up. Refresh the page and try again.");
    setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: pending.factorId, code: code.trim() });
    if (err) {
      setBusy(false);
      return setError("That code didn't work. Check the time on your phone is set automatically, then try the newest code.");
    }
    await recordFactorAdded(pending.factorId);
    // Full navigation, so the server renders with the new (verified) session cookie.
    window.location.assign("/account/security?added=1");
  }

  async function cancel() {
    if (pending) await createClient().auth.mfa.unenroll({ factorId: pending.factorId });
    setPending(null);
    setCode("");
    setShowKey(false);
    setError(null);
  }

  if (!pending)
    return (
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="factor-name">Name for this authenticator</label>
          <input id="factor-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <p className="mt-1 text-xs text-muted">For example the phone or app it lives on, so you can tell them apart later.</p>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="button" className="btn-primary" onClick={start} disabled={busy} aria-busy={busy}>
          {busy ? "Starting…" : "Start set-up"}
        </button>
      </div>
    );

  return (
    <form onSubmit={confirm} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Open your authenticator app and add a new account.</li>
        <li>Scan this QR code, or type in the setup key.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from Supabase Auth */}
      <img src={pending.qr} alt="QR code for your authenticator app" width={192} height={192} className="rounded-lg border border-line bg-white p-2" />
      <div>
        <button type="button" className="link text-sm" onClick={() => setShowKey((v) => !v)} aria-expanded={showKey}>
          {showKey ? "Hide setup key" : "Can't scan? Show setup key"}
        </button>
        {showKey && (
          <p className="mt-2 break-all rounded-lg bg-cream p-2 font-mono text-sm" data-testid="totp-secret">{pending.secret}</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="enroll-code">6-digit code</label>
        <input id="enroll-code" className="input text-center text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>{busy ? "Checking…" : "Verify and turn on"}</button>
        <button type="button" className="btn-secondary" onClick={cancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
