"use client";
import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";
import { AuthCard } from "@/components/AuthCard";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

export default function ResetPage() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <AuthCard title="Choose a new password">
      <form action={action} className="space-y-4">
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
          <FieldError state={state} name="password" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
          <FieldError state={state} name="confirm" />
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn-primary w-full">Update password</SubmitButton>
      </form>
    </AuthCard>
  );
}
