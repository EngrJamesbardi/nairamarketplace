"use client";
import { useActionState } from "react";
import { resendConfirmation } from "@/app/actions/auth";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

export function ResendForm({ email }: { email?: string }) {
  const [state, action] = useActionState(resendConfirmation, null);
  return (
    <form action={action} className="space-y-3" noValidate>
      <div>
        <label className="label" htmlFor="resend-email">Email</label>
        <input id="resend-email" name="email" type="email" autoComplete="email" required defaultValue={email} className="input" />
        <FieldError state={state} name="email" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full" pendingText="Sending…">Resend verification email</SubmitButton>
    </form>
  );
}
