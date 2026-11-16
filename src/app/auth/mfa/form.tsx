"use client";
import { useActionState } from "react";
import { cancelMfa, verifyMfaCode } from "@/app/actions/mfa";
import { FieldError, FormMessage, SubmitButton } from "@/components/FormStatus";

export function MfaForm({ next, factors }: { next: string; factors: { id: string; name: string }[] }) {
  const [state, action] = useActionState(verifyMfaCode, null);
  return (
    <div className="space-y-3">
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {factors.length > 1 ? (
          <div>
            <label className="label" htmlFor="factorId">Authenticator</label>
            <select id="factorId" name="factorId" className="input" defaultValue={factors[0].id}>
              {factors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        ) : (
          <input type="hidden" name="factorId" value={factors[0].id} />
        )}
        <div>
          <label className="label" htmlFor="code">6-digit code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className="input text-center text-lg tracking-[0.4em]" aria-describedby={state?.fieldErrors?.code ? "code-error" : undefined} />
          <FieldError state={state} name="code" />
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn-primary w-full" pendingText="Checking…">Verify</SubmitButton>
      </form>
      <form action={cancelMfa}>
        <button type="submit" className="btn-secondary w-full">Cancel and sign out</button>
      </form>
    </div>
  );
}
