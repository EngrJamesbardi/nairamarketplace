"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { setDeactivated, deleteAccount } from "@/app/actions/privacy";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

/** Data rights: export, deactivate/reactivate and permanent deletion. */
export function PrivacySection({ status }: { status: string }) {
  const [deactState, deactAction] = useActionState(setDeactivated, null);
  const [delState, delAction] = useActionState(deleteAccount, null);
  const deactivated = status === "deactivated";
  return (
    <section className="card space-y-4 p-5" aria-labelledby="privacy-h">
      <h2 id="privacy-h" className="h2">Your data & privacy</h2>
      <p className="text-sm text-muted">
        Read our <Link className="link" href="/legal/privacy">privacy notice</Link>. You can download your data, pause your account or delete it.
      </p>
      <a href="/api/account/export" className="btn-secondary" download>
        <Download className="size-4" aria-hidden /> Download my data (JSON)
      </a>
      <form action={deactAction} className="space-y-2 border-t border-line pt-4">
        <h3 className="font-semibold">{deactivated ? "Reactivate account" : "Deactivate account"}</h3>
        <p className="text-sm text-muted">
          {deactivated
            ? "Your profile, storefront and listings are hidden. Reactivate to make them visible again."
            : "Hides your profile, storefront and listings and stops new messages. Your data is kept and you can come back any time."}
        </p>
        <input type="hidden" name="deactivate" value={deactivated ? "0" : "1"} />
        <FormMessage state={deactState} />
        <SubmitButton className="btn-secondary">{deactivated ? "Reactivate my account" : "Deactivate my account"}</SubmitButton>
      </form>
      <details className="border-t border-line pt-4">
        <summary className="cursor-pointer font-semibold text-danger">Delete account permanently</summary>
        <form action={delAction} className="mt-3 space-y-2">
          <p className="text-sm text-muted">
            This removes your name, photo, contact details, storefront details, saved items, follows and notifications, and archives
            your listings. Messages you sent stay visible to the people you talked to, shown as from &ldquo;Deleted member&rdquo;.
            Records we must keep by law (for example payment records) are retained for the required period. This cannot be undone.
          </p>
          <label className="label" htmlFor="confirm-delete">Type DELETE to confirm</label>
          <input id="confirm-delete" name="confirm" autoComplete="off" className="input max-w-xs" />
          <FieldError state={delState} name="confirm" />
          <FormMessage state={delState} />
          <SubmitButton className="btn-danger" pendingText="Deleting…">Delete my account</SubmitButton>
        </form>
      </details>
    </section>
  );
}
