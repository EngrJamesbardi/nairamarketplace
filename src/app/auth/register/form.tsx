"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

export function RegisterForm({ countries, defaultCountry }: { countries: { code: string; name: string }[]; defaultCountry: string }) {
  const [state, action] = useActionState(signUp, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label className="label" htmlFor="displayName">Your name</label>
        <input id="displayName" name="displayName" autoComplete="name" required maxLength={80} className="input" />
        <FieldError state={state} name="displayName" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        <FieldError state={state} name="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" aria-describedby="pw-help" />
        <p id="pw-help" className="mt-1 text-xs text-muted">At least 8 characters, with a letter and a number.</p>
        <FieldError state={state} name="password" />
      </div>
      <div>
        <label className="label" htmlFor="countryCode">Country</label>
        <select id="countryCode" name="countryCode" defaultValue={defaultCountry} className="input">
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptTerms" className="mt-1 size-4 accent-[var(--brand)]" required />
        <span>I agree to the <Link href="/legal/terms" className="link" target="_blank">Terms of use</Link> and <Link href="/legal/privacy" className="link" target="_blank">Privacy policy</Link>, and confirm I am at least 18 years old.</span>
      </label>
      <FieldError state={state} name="acceptTerms" />
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
