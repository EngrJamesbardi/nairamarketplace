"use client";
import { useActionState, useState } from "react";
import { removeFactor } from "@/app/actions/mfa";
import { FieldError, FormMessage, SubmitButton } from "@/components/FormStatus";

export function RemoveFactorForm({ id, name, needsTyped }: { id: string; name: string; needsTyped: boolean }) {
  const [state, action] = useActionState(removeFactor, null);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-secondary min-h-9" onClick={() => setOpen(true)} aria-label={`Remove ${name}`}>
        Remove
      </button>
    );
  return (
    <form action={action} className="w-full space-y-2 rounded-lg bg-danger/5 p-3">
      <input type="hidden" name="factorId" value={id} />
      <p className="text-sm">
        Remove <strong>{name}</strong>?{needsTyped && " This is your only authenticator: you will need to set one up again before you can use Admin."}
      </p>
      {needsTyped && (
        <div>
          <label className="label" htmlFor={`confirm-${id}`}>Type REMOVE to confirm</label>
          <input id={`confirm-${id}`} name="confirm" className="input" autoComplete="off" />
          <FieldError state={state} name="confirm" />
        </div>
      )}
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton className="btn-danger min-h-9" pendingText="Removing…">Remove authenticator</SubmitButton>
        <button type="button" className="btn-secondary min-h-9" onClick={() => setOpen(false)}>Keep it</button>
      </div>
    </form>
  );
}
