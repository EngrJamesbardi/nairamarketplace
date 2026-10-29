"use client";
import { useActionState, useState } from "react";
import { createPromotion, cancelPromotion } from "@/app/actions/promotions";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

type Price = { placement: string; credits_per_day: number; label: string };

export function PromotionForm({ listings, prices }: { listings: { id: string; title: string }[]; prices: Price[] }) {
  const [state, action] = useActionState(createPromotion, null);
  const [placement, setPlacement] = useState(prices[0]?.placement ?? "search");
  const [days, setDays] = useState(7);
  const perDay = prices.find((p) => p.placement === placement)?.credits_per_day ?? 0;
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="listingId">Listing</label>
        <select id="listingId" name="listingId" className="input" required>
          {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
        <FieldError state={state} name="listingId" />
      </div>
      <fieldset>
        <legend className="label">Where</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {prices.map((p) => (
            <label key={p.placement} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-cream">
              <input type="radio" name="placement" value={p.placement} checked={placement === p.placement} onChange={() => setPlacement(p.placement)} className="accent-[var(--brand)]" />
              <span>{p.label}<br /><span className="text-xs text-muted">{p.credits_per_day} credits/day</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <label className="label" htmlFor="days">Days</label>
          <input id="days" name="days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="input" />
        </div>
        <p className="pb-3 text-sm">Total: <strong>{perDay * (days || 0)} credits</strong></p>
      </div>
      <FieldError state={state} name="days" />
      <FormMessage state={state} />
      <SubmitButton pendingText="Starting…">Start promotion</SubmitButton>
    </form>
  );
}

/** Stays mounted after the campaign ends so the refund confirmation remains visible. */
export function CancelPromotion({ id, live }: { id: string; live: boolean }) {
  const [state, action] = useActionState(cancelPromotion, null);
  if (!live && !state) return null;
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="id" value={id} />
      {live && <SubmitButton className="btn-secondary min-h-9 px-3 text-xs" pendingText="Stopping…">Stop & refund unused days</SubmitButton>}
      <FormMessage state={state} />
    </form>
  );
}
