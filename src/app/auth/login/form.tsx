"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        <FieldError state={state} name="email" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">Password</label>
          <Link href="/auth/forgot" className="link text-xs">Forgot password?</Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        <FieldError state={state} name="password" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
