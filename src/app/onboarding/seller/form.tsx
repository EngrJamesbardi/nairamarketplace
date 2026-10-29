"use client";
import { useActionState, useState } from "react";
import { saveSellerProfile } from "@/app/actions/seller";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";
import { ImageUploader } from "@/components/ImageUploader";
import { DELIVERY_OPTIONS, SELLER_TYPES } from "@/lib/validation";
import { t } from "@/i18n";
import type { Database } from "@/types/database";

type Seller = Database["public"]["Tables"]["seller_profiles"]["Row"];
type Country = { code: string; name: string; region_label: string; is_active: boolean };
type Region = { id: number; name: string; country_code: string };

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function SellerForm({ userId, seller, countries, regions, defaultCountry, next }: { userId: string; seller: Seller | null; countries: Country[]; regions: Region[]; defaultCountry: string; next?: string }) {
  const [state, action] = useActionState(saveSellerProfile, null);
  const [country, setCountry] = useState(seller?.country_code ?? defaultCountry);
  const [slug, setSlug] = useState(seller?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!seller);
  const c = countries.find((x) => x.code === country);
  const hoursText = (seller?.business_hours as { text?: string } | null)?.text ?? "";

  return (
    <form action={action} className="space-y-6" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset className="card space-y-4 p-5">
        <legend className="px-1 text-lg font-bold">Your shop</legend>
        <div>
          <label className="label" htmlFor="shopName">Shop name</label>
          <input id="shopName" name="shopName" required maxLength={80} defaultValue={seller?.shop_name} className="input"
            onChange={(e) => { if (!slugTouched) setSlug(slugify(e.target.value)); }} />
          <FieldError state={state} name="shopName" />
        </div>
        <div>
          <label className="label" htmlFor="slug">Shop web address</label>
          <div className="flex items-center gap-1 text-sm text-muted">
            <span>/s/</span>
            <input id="slug" name="slug" required value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} className="input" maxLength={60} />
          </div>
          <FieldError state={state} name="slug" />
        </div>
        <div>
          <label className="label" htmlFor="sellerType">What kind of seller are you?</label>
          <select id="sellerType" name="sellerType" defaultValue={seller?.seller_type ?? "individual"} className="input">
            {SELLER_TYPES.map((s) => <option key={s} value={s}>{t(`sellerType.${s}`)}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">Individuals can sell personal belongings without registering a business.</p>
        </div>
        <div>
          <label className="label" htmlFor="description">Short description</label>
          <textarea id="description" name="description" rows={3} maxLength={1000} defaultValue={seller?.description ?? ""} className="input" />
        </div>
        <div>
          <span className="label">Profile image or logo (optional)</span>
          <ImageUploader userId={userId} bucket="avatars" name="logo" max={1}
            initial={seller?.logo_url ? [{ path: seller.logo_url, url: seller.logo_url }] : []} />
          <FieldError state={state} name="logo" />
        </div>
      </fieldset>

      <fieldset className="card space-y-4 p-5">
        <legend className="px-1 text-lg font-bold">Location</legend>
        <p className="text-sm text-muted">Shown publicly as a general area only. Never share your exact address publicly.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="countryCode">Country</label>
            <select id="countryCode" name="countryCode" value={country} onChange={(e) => setCountry(e.target.value)} className="input" disabled={!!seller}>
              {countries.filter((x) => x.is_active || x.code === seller?.country_code).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
            {seller && <input type="hidden" name="countryCode" value={country} />}
            <FieldError state={state} name="countryCode" />
          </div>
          <div>
            <label className="label" htmlFor="regionId">{c?.region_label ?? "Region"}</label>
            <select id="regionId" name="regionId" defaultValue={seller?.region_id ?? ""} className="input" key={country}>
              <option value="">Choose…</option>
              {regions.filter((r) => r.country_code === country).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="city">City or area</label>
            <input id="city" name="city" maxLength={80} defaultValue={seller?.city ?? ""} className="input" />
          </div>
        </div>
      </fieldset>

      <fieldset className="card space-y-4 p-5">
        <legend className="px-1 text-lg font-bold">Delivery & collection</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DELIVERY_OPTIONS.map((d) => (
            <label key={d} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-brand has-[:checked]:bg-cream">
              <input type="checkbox" name="deliveryOptions" value={d} defaultChecked={(seller?.delivery_options ?? ["local_pickup"]).includes(d)} className="size-4 accent-[var(--brand)]" />
              {t(`delivery.${d}`)}
            </label>
          ))}
        </div>
        <FieldError state={state} name="deliveryOptions" />
        <div>
          <label className="label" htmlFor="deliveryNotes">Notes (optional)</label>
          <textarea id="deliveryNotes" name="deliveryNotes" rows={2} maxLength={500} defaultValue={seller?.delivery_notes ?? ""} className="input" placeholder="e.g. Pickup at Computer Village, dispatch within Lagos only" />
        </div>
      </fieldset>

      <fieldset className="card space-y-4 p-5">
        <legend className="px-1 text-lg font-bold">Contact & business details (optional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="whatsappNumber">WhatsApp number</label>
            <input id="whatsappNumber" name="whatsappNumber" inputMode="tel" defaultValue={seller?.whatsapp_number ?? ""} className="input" />
            <FieldError state={state} name="whatsappNumber" />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="showWhatsapp" defaultChecked={seller?.show_whatsapp} className="size-4 accent-[var(--brand)]" />
              Show a WhatsApp button on my listings
            </label>
          </div>
          <div>
            <label className="label" htmlFor="contactPhone">Phone</label>
            <input id="contactPhone" name="contactPhone" inputMode="tel" defaultValue={seller?.contact_phone ?? ""} className="input" />
            <FieldError state={state} name="contactPhone" />
          </div>
          <div>
            <label className="label" htmlFor="contactEmail">Contact email</label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={seller?.contact_email ?? ""} className="input" />
            <FieldError state={state} name="contactEmail" />
          </div>
          <div>
            <label className="label" htmlFor="businessHours">Business hours</label>
            <input id="businessHours" name="businessHours" maxLength={200} defaultValue={hoursText} className="input" placeholder="Mon–Sat 9am–6pm" />
          </div>
          <div>
            <label className="label" htmlFor="businessName">Registered business name</label>
            <input id="businessName" name="businessName" maxLength={120} defaultValue={seller?.business_name ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="businessRegistrationNumber">Registration number</label>
            <input id="businessRegistrationNumber" name="businessRegistrationNumber" maxLength={60} defaultValue={seller?.business_registration_number ?? ""} className="input" />
          </div>
        </div>
        <p className="text-xs text-muted">Business details are not checked automatically. A &ldquo;Verified&rdquo; badge only appears after our team reviews your documents.</p>
      </fieldset>

      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Saving…">{seller ? "Save storefront" : "Create my storefront"}</SubmitButton>
    </form>
  );
}
