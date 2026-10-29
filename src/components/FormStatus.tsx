"use client";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/validation";

export function SubmitButton({ children, className = "btn-primary", pendingText = "Please wait…", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || rest.disabled} aria-busy={pending} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
        <span className="font-semibold">Error: </span>
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
        <span className="font-semibold">Done: </span>
        {state.message}
      </p>
    );
  return null;
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const msg = state?.fieldErrors?.[name];
  if (!msg) return null;
  return (
    <p id={`${name}-error`} className="mt-1 text-xs font-medium text-danger">
      {msg}
    </p>
  );
}
