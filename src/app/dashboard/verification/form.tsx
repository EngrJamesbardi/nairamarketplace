"use client";
import { useActionState } from "react";
import { requestVerification } from "@/app/actions/seller";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

export function VerificationForm({ defaults }: { defaults: { businessName: string; registrationNumber: string } }) {
  const [state, action] = useActionState(requestVerification, null);
  return (
    <form action={action} className="card space-y-3 p-5">
      <div>
        <label className="label" htmlFor="businessName">Registered business name</label>
        <input id="businessName" name="businessName" required maxLength={120} defaultValue={defaults.businessName} className="input" />
        <FieldError state={state} name="businessName" />
      </div>
      <div>
        <label className="label" htmlFor="registrationNumber">Registration number (e.g. CAC RC/BN number)</label>
        <input id="registrationNumber" name="registrationNumber" required maxLength={60} defaultValue={defaults.registrationNumber} className="input" />
        <FieldError state={state} name="registrationNumber" />
      </div>
      <div>
        <label className="label" htmlFor="notes">Anything else we should know (optional)</label>
        <textarea id="notes" name="notes" maxLength={1000} rows={3} className="input" />
      </div>
      <p className="text-xs text-muted">Document upload is not yet available. Our team may contact you through your storefront email for documents.</p>
      <FormMessage state={state} />
      <SubmitButton>Request verification</SubmitButton>
    </form>
  );
}
