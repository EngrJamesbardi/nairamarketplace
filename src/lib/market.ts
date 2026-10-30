import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { COUNTRY_COOKIE, DEFAULT_COUNTRY, type Country } from "@/lib/countries";
import { getSession } from "@/lib/auth";

export const getCountries = cache(async (): Promise<Country[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("countries").select("*").order("sort_order");
  return data ?? [];
});

export const getActiveCountries = cache(async () => (await getCountries()).filter((c) => c.is_active));

/** The market the visitor is browsing: cookie → profile country → default. Only active markets. */
export const getSelectedCountry = cache(async (): Promise<Country> => {
  const [countries, jar, session] = await Promise.all([getCountries(), cookies(), getSession()]);
  const active = countries.filter((c) => c.is_active);
  const candidates = [jar.get(COUNTRY_COOKIE)?.value, session.profile?.country_code, DEFAULT_COUNTRY];
  for (const code of candidates) {
    const c = active.find((x) => x.code === code);
    if (c) return c;
  }
  return active[0] ?? countries[0];
});

export const getCategories = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").eq("is_active", true).order("sort_order");
  return data ?? [];
});

export const getRegions = cache(async (country: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("regions").select("*").eq("country_code", country).eq("is_active", true).order("name");
  return data ?? [];
});

/** Second-level divisions (e.g. LGAs) of one region. Empty for markets without that data. */
export const getAreas = cache(async (regionId: number | null | undefined) => {
  if (!regionId) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("areas").select("id, name").eq("region_id", regionId).eq("is_active", true).order("name");
  return data ?? [];
});

export const getSetting = cache(async <T,>(key: string, fallback: T): Promise<T> => {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
});
