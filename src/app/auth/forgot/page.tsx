"use client";
import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { AuthCard } from "@/components/AuthCard";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

export default function ForgotPage() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      <form action={action} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
          <FieldError state={state} name="email" />
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn-primary w-full">Send reset link</SubmitButton>
      </form>
    </AuthCard>
  );
}
