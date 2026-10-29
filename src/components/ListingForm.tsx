"use client";
import { startTransition, useActionState, useEffect, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { saveListing } from "@/app/actions/listings";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";
import { ImageUploader } from "@/components/ImageUploader";
import { CONDITIONS, DELIVERY_OPTIONS } from "@/lib/validation";
import { minorToMajorString } from "@/lib/money";
import { t } from "@/i18n";
import type { Database } from "@/types/database";

type Listing = Database["public"]["Tables"]["listings"]["Row"];
type Category = { id: number; parent_id: number | null; name: string; attribute_schema: unknown };
type Region = { id: number; name: string };
type Attr = { key: string; label: string; type: "text" | "number" | "select"; options?: string[]; min?: number; max?: number };

export function ListingForm({
  userId,
  listing,
  images = [],
  categories,
  regions,
  currency,
  regionLabel,
  sellerDefaults,
  requestId,
}: {
  userId: string;
  listing?: Listing;
  images?: { path: string; url: string }[];
  categories: Category[];
  regions: Region[];
  currency: string;
  regionLabel: string;
  sellerDefaults: { regionId: number | null; city: string | null; deliveryOptions: string[] };
  /** New listings only: generated on the server so repeat submissions of this form are recognised. */
  requestId?: string;
}) {
  // A dropped connection would otherwise throw to the error page and lose everything the seller typed. The listing may
  // already be saved, so say so: publishing again is safe because requestId makes the save idempotent.
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof saveListing>[0], formData: FormData) => {
    try {
      return await saveListing(prev, formData);
    } catch (e) {
      unstable_rethrow(e);
      return { error: "Connection problem. Your listing may already be saved. Check your connection and tap the button again: it won't be posted twice." };
    }
  }, null);
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);
  const [categoryId, setCategoryId] = useState<number | "">(listing?.category_id ?? "");
  const [priceType, setPriceType] = useState(listing?.price_type ?? "negotiable");
  const top = categories.filter((c) => !c.parent_id);
  const subs = categories.filter((c) => c.parent_id === categoryId);
  const attrs = ((categories.find((c) => c.id === categoryId)?.attribute_schema ?? []) as Attr[]) || [];
  const currentAttrs = (listing?.attributes ?? {}) as Record<string, string | number>;
  const isDraft = !listing || listing.status === "draft";

  return (
    <form
      action={action}
      // Submit through the action ourselves so React does not clear the form afterwards: a validation error or a dropped
      // connection must not wipe what the seller typed. Without JavaScript the form still posts natively via `action`.
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const formData = new FormData(e.currentTarget, submitter);
        startTransition(() => action(formData));
      }}
      className="space-y-6"
      noValidate
    >
      {listing && <input type="hidden" name="id" value={listing.id} />}
      {!listing && requestId && <input type="hidden" name="requestId" value={requestId} />}
      <input type="hidden" name="currency" value={currency} />

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-bold">Photos</h2>
        <ImageUploader userId={userId} initial={images} />
        <FieldError state={state} name="images" />
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Details</h2>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" required minLength={3} maxLength={120} defaultValue={listing?.title} className="input" placeholder="e.g. Samsung Galaxy A54, 128GB, black" />
          <FieldError state={state} name="title" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="categoryId">Category</label>
            <select id="categoryId" name="categoryId" required value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")} className="input">
              <option value="">Choose a category</option>
              {top.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <FieldError state={state} name="categoryId" />
          </div>
          <div>
            <label className="label" htmlFor="subcategoryId">Subcategory</label>
            <select id="subcategoryId" name="subcategoryId" defaultValue={listing?.subcategory_id ?? ""} className="input" disabled={subs.length === 0} key={String(categoryId)}>
              <option value="">{subs.length ? "Optional" : "None"}</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" required rows={6} minLength={10} maxLength={5000} defaultValue={listing?.description} className="input" placeholder="Describe the item honestly: condition, size, faults, what's included." />
          <FieldError state={state} name="description" />
        </div>
        <fieldset>
          <legend className="label">Condition</legend>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <label key={c} className="chip cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-cream has-[:checked]:font-semibold">
                <input type="radio" name="condition" value={c} defaultChecked={(listing?.condition ?? "used_good") === c} className="sr-only" />
                {t(`condition.${c}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {attrs.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {attrs.map((a) => (
              <div key={a.key}>
                <label className="label" htmlFor={`attr-${a.key}`}>{a.label} <span className="font-normal text-muted">(optional)</span></label>
                {a.type === "select" ? (
                  <select id={`attr-${a.key}`} name={`attr.${a.key}`} defaultValue={String(currentAttrs[a.key] ?? "")} className="input">
                    <option value="">—</option>
                    {a.options?.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={`attr-${a.key}`} name={`attr.${a.key}`} type={a.type === "number" ? "number" : "text"} min={a.min} max={a.max} maxLength={100}
                    defaultValue={String(currentAttrs[a.key] ?? "")} className="input" />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Price</h2>
        <fieldset>
          <legend className="sr-only">Price type</legend>
          <div className="flex flex-wrap gap-2">
            {(["fixed", "negotiable", "contact"] as const).map((p) => (
              <label key={p} className={`chip cursor-pointer ${priceType === p ? "chip-active" : ""}`}>
                <input type="radio" name="priceType" value={p} checked={priceType === p} onChange={() => setPriceType(p)} className="sr-only" />
                {p === "fixed" ? "Fixed price" : p === "negotiable" ? "Negotiable" : "Contact for price"}
              </label>
            ))}
          </div>
        </fieldset>
        {priceType !== "contact" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="price">Price ({currency})</label>
              <input id="price" name="price" inputMode="decimal" required className="input"
                defaultValue={listing?.price_minor != null ? minorToMajorString(listing.price_minor, currency).replace(/\.00$/, "") : ""} />
              <FieldError state={state} name="price" />
            </div>
          </div>
        )}
        <div className="w-40">
          <label className="label" htmlFor="quantity">Quantity available</label>
          <input id="quantity" name="quantity" type="number" min={0} max={100000} defaultValue={listing?.quantity ?? 1} className="input" />
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Location & delivery</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="regionId">{regionLabel}</label>
            <select id="regionId" name="regionId" defaultValue={listing?.region_id ?? sellerDefaults.regionId ?? ""} className="input">
              <option value="">Choose…</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="city">City or area</label>
            <input id="city" name="city" maxLength={80} defaultValue={listing?.city ?? sellerDefaults.city ?? ""} className="input" />
          </div>
        </div>
        <fieldset>
          <legend className="label">How can buyers get it?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DELIVERY_OPTIONS.map((d) => (
              <label key={d} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-brand has-[:checked]:bg-cream">
                <input type="checkbox" name="deliveryOptions" value={d} defaultChecked={(listing?.delivery_options ?? sellerDefaults.deliveryOptions).includes(d)} className="size-4 accent-[var(--brand)]" />
                {t(`delivery.${d}`)}
              </label>
            ))}
          </div>
          <FieldError state={state} name="deliveryOptions" />
        </fieldset>
        <div>
          <label className="label" htmlFor="deliveryNotes">Delivery notes (optional)</label>
          <textarea id="deliveryNotes" name="deliveryNotes" rows={2} maxLength={500} defaultValue={listing?.delivery_notes ?? ""} className="input" placeholder="e.g. Buyer pays dispatch. Pickup in Yaba." />
        </div>
        <p className="text-xs text-muted">{t("fulfilment.notice")}</p>
      </section>

      <FormMessage state={state} />
      {state?.redirectTo && (
        <p role="status" className="text-sm text-success">Saved. <a href={state.redirectTo} className="link">Go to your listings</a></p>
      )}
      <div className="flex flex-wrap gap-3">
        <SubmitButton name="status" value="active" pendingText="Saving…" pending={pending}>{isDraft ? "Publish listing" : "Save changes"}</SubmitButton>
        {isDraft && <SubmitButton name="status" value="draft" className="btn-secondary" pendingText="Saving…" pending={pending}>Save as draft</SubmitButton>}
      </div>
    </form>
  );
}
