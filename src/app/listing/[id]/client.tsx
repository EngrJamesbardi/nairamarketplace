"use client";
import { useActionState, useEffect, useState } from "react";
import { Flag, Share2 } from "lucide-react";
import { contactSeller, makeOffer, recordView } from "@/app/actions/messages";
import { submitReport } from "@/app/actions/social";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

export function ViewTracker({ listingId }: { listingId: string }) {
  useEffect(() => {
    recordView(listingId).catch(() => {});
  }, [listingId]);
  return null;
}

export function Gallery({ images, title }: { images: { url: string; alt_text: string | null }[]; title: string }) {
  const [i, setI] = useState(0);
  if (images.length === 0)
    return <div className="card flex aspect-square items-center justify-center text-muted">No photos provided</div>;
  return (
    <div>
      <div className="card overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i].url} alt={images[i].alt_text ?? title} className="aspect-square w-full bg-canvas object-contain" />
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto" role="tablist" aria-label="Photos">
          {images.map((img, idx) => (
            <button key={img.url} role="tab" aria-selected={idx === i} aria-label={`Photo ${idx + 1}`} onClick={() => setI(idx)}
              className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${idx === i ? "border-brand" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContactForm({ listingId, sellerName }: { listingId: string; sellerName: string }) {
  const [state, action] = useActionState(contactSeller, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <label htmlFor="msg" className="label">Message {sellerName}</label>
      <textarea id="msg" name="body" required maxLength={2000} rows={3} className="input" defaultValue="Hi, is this still available?" />
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Sending…">Send message</SubmitButton>
    </form>
  );
}

export function OfferForm({ listingId, currency, maxQty }: { listingId: string; currency: string; maxQty: number }) {
  const [state, action] = useActionState(makeOffer, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="currency" value={currency} />
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="offer-amount" className="label">Your offer ({currency})</label>
          <input id="offer-amount" name="amount" inputMode="decimal" required className="input" placeholder="e.g. 15000"
            aria-describedby={state?.fieldErrors?.amount ? "amount-error" : undefined} />
          <FieldError state={state} name="amount" />
        </div>
        {maxQty > 1 && (
          <div className="w-24">
            <label htmlFor="offer-qty" className="label">Qty</label>
            <input id="offer-qty" name="quantity" type="number" min={1} max={maxQty} defaultValue={1} className="input" />
          </div>
        )}
      </div>
      <input name="note" maxLength={500} className="input" placeholder="Optional note (e.g. pickup Saturday)" aria-label="Note to seller" />
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full" pendingText="Sending offer…">Make an offer</SubmitButton>
      <p className="text-xs text-muted">An accepted offer means you agreed a price. It is not a payment or a delivery booking.</p>
    </form>
  );
}

export function ReportForm({ targetType, listingId, userId, messageId, label = "Report listing" }: { targetType: "listing" | "user" | "message"; listingId?: string; userId?: string; messageId?: string; label?: string }) {
  const [state, action] = useActionState(submitReport, null);
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-muted hover:text-danger">
        <Flag className="size-4" aria-hidden /> {label}
      </summary>
      {state?.ok ? (
        <FormMessage state={state} />
      ) : (
        <form action={action} className="card mt-2 space-y-2 p-3">
          <input type="hidden" name="targetType" value={targetType} />
          {listingId && <input type="hidden" name="listingId" value={listingId} />}
          {userId && <input type="hidden" name="userId" value={userId} />}
          {messageId && <input type="hidden" name="messageId" value={messageId} />}
          <label className="label" htmlFor={`reason-${targetType}`}>Reason</label>
          <select id={`reason-${targetType}`} name="reason" required className="input" defaultValue="">
            <option value="" disabled>Choose a reason</option>
            <option value="scam_or_fraud">Scam or fraud</option>
            <option value="prohibited_item">Prohibited item</option>
            <option value="counterfeit">Counterfeit</option>
            <option value="misleading">Misleading or inaccurate</option>
            <option value="offensive">Offensive content</option>
            <option value="harassment">Harassment</option>
            <option value="spam">Spam</option>
            <option value="wrong_category">Wrong category</option>
            <option value="other">Other</option>
          </select>
          <textarea name="details" maxLength={1000} rows={2} className="input" placeholder="Details (optional)" aria-label="Details" />
          <FormMessage state={state} />
          <SubmitButton className="btn-danger w-full">Submit report</SubmitButton>
        </form>
      )}
    </details>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn-ghost" onClick={async () => {
      const url = location.href;
      if (navigator.share) await navigator.share({ title, url }).catch(() => {});
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    }}>
      <Share2 className="size-4" aria-hidden /> {copied ? "Link copied" : "Share"}
    </button>
  );
}
