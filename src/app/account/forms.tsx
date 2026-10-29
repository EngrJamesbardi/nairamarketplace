"use client";
import { useActionState } from "react";
import { updateProfile, updatePreferences } from "@/app/actions/account";
import { FormMessage, SubmitButton, FieldError } from "@/components/FormStatus";

type Profile = { display_name: string; bio: string | null; country_code: string | null; region_id: number | null; city: string | null; phone: string | null; notification_prefs: unknown };

export function ProfileForm({ profile, countries, regions }: { profile: Profile; countries: { code: string; name: string }[]; regions: { id: number; name: string; country_code: string }[] }) {
  const [state, action] = useActionState(updateProfile, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="displayName">Display name</label>
          <input id="displayName" name="displayName" required maxLength={80} defaultValue={profile.display_name} className="input" />
          <FieldError state={state} name="displayName" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone (private, optional)</label>
          <input id="phone" name="phone" inputMode="tel" defaultValue={profile.phone ?? ""} className="input" />
          <FieldError state={state} name="phone" />
          <p className="mt-1 text-xs text-muted">Not shown publicly. Phone verification is not yet available.</p>
        </div>
        <div>
          <label className="label" htmlFor="countryCode">Country</label>
          <select id="countryCode" name="countryCode" defaultValue={profile.country_code ?? "NG"} className="input">
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="regionId">Region</label>
          <select id="regionId" name="regionId" defaultValue={profile.region_id ?? ""} className="input">
            <option value="">—</option>
            {regions.filter((r) => r.country_code === (profile.country_code ?? "NG")).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="city">City or area</label>
          <input id="city" name="city" maxLength={80} defaultValue={profile.city ?? ""} className="input" />
        </div>
        <input type="hidden" name="preferredLanguage" value="en" />
      </div>
      <div>
        <label className="label" htmlFor="bio">About you</label>
        <textarea id="bio" name="bio" maxLength={500} rows={2} defaultValue={profile.bio ?? ""} className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

export function PreferencesForm({ prefs, theme }: { prefs: Record<string, boolean>; theme: string }) {
  const [state, action] = useActionState(updatePreferences, null);
  const items = [
    ["messages", "New messages"],
    ["offers", "Offers and counter-offers"],
    ["follows", "New followers"],
    ["listing_updates", "New listings from shops I follow"],
    ["marketing", "Occasional tips and news from Naira Marketplace (optional)"],
  ];
  return (
    <form action={action} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="label">In-app notifications</legend>
        {items.map(([k, label]) => (
          <label key={k} className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" name={k} defaultChecked={prefs[k] ?? k !== "marketing"} className="size-4 accent-[var(--brand)]" /> {label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend className="label">Appearance</legend>
        <div className="flex gap-2">
          {["light", "dark"].map((th) => (
            <label key={th} className="chip cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-cream">
              <input type="radio" name="theme" value={th} defaultChecked={theme === th} className="sr-only" /> {th === "light" ? "Light (default)" : "Dark"}
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary">Save preferences</SubmitButton>
    </form>
  );
}
