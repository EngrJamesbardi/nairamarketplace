"use client";
import { useActionState } from "react";
import { submitReview } from "@/app/actions/reviews";
import { FormMessage, SubmitButton } from "@/components/FormStatus";

export function ReviewForm({ listingId, sellerName, verified, existing }: { listingId: string; sellerName: string; verified: boolean; existing: { rating: number; body: string | null } | null }) {
  const [state, action] = useActionState(submitReview, null);
  return (
    <details className="card p-4" open={!existing || !!state}>
      <summary className="cursor-pointer font-semibold">{existing ? `Your review of ${sellerName} (${existing.rating}★) — edit` : `Review ${sellerName}`}</summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="listingId" value={listingId} />
        <p className="text-xs text-muted">{verified ? "The seller confirmed this sale, so your review will show as a confirmed sale." : "The seller accepted your offer but hasn't confirmed a sale, so your review will be labelled as an agreed-price interaction."}</p>
        <fieldset>
          <legend className="label">Rating</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="chip cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-cream">
                <input type="radio" name="rating" value={n} defaultChecked={existing ? existing.rating === n : n === 5} className="sr-only" />{n}★
              </label>
            ))}
          </div>
        </fieldset>
        <textarea name="body" maxLength={1000} rows={2} defaultValue={existing?.body ?? ""} className="input" placeholder="How was your experience?" aria-label="Review" />
        <FormMessage state={state} />
        <SubmitButton className="btn-secondary">Submit review</SubmitButton>
      </form>
    </details>
  );
}
