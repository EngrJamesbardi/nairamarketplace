import type { Database } from "@/types/database";

export type Country = Database["public"]["Tables"]["countries"]["Row"];
export const COUNTRY_COOKIE = "nm_country";
export const DEFAULT_COUNTRY = "NG";

/** Validate a phone number against the country's pattern and normalise to E.164. */
export function normalisePhone(input: string, country: Pick<Country, "phone_prefix" | "phone_pattern">): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const prefixDigits = country.phone_prefix.replace("+", "");
  let national = digits;
  if (national.startsWith("+")) {
    if (!national.startsWith(country.phone_prefix)) return null;
    national = national.slice(country.phone_prefix.length);
  } else if (national.startsWith(prefixDigits) && national.length > 10) {
    national = national.slice(prefixDigits.length);
  }
  national = national.replace(/^0/, "");
  if (!new RegExp(country.phone_pattern).test(national)) return null;
  return `${country.phone_prefix}${national}`;
}

export function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
