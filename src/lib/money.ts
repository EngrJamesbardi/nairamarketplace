/**
 * Exact money handling. Amounts are integers in minor units (kobo, pesewas, cents) and always
 * travel with an ISO-4217 currency code. No floating point is used for arithmetic.
 */
export type Money = { amountMinor: bigint | number; currency: string };

const MINOR_UNITS: Record<string, number> = { NGN: 2, GHS: 2, KES: 2, ZAR: 2, USD: 2 };

export function minorUnits(currency: string): number {
  return MINOR_UNITS[currency] ?? 2;
}

/** Parse a user-entered major-unit string ("12,500.50") into minor units without floats. */
export function parseToMinor(input: string, currency: string): bigint | null {
  const cleaned = input.replace(/[\s,]/g, "").replace(/^[^\d.]+/, "");
  const digits = minorUnits(currency);
  const re = digits > 0 ? new RegExp(`^(\\d{1,13})(?:\\.(\\d{1,${digits}}))?$`) : /^(\d{1,15})$/;
  const m = re.exec(cleaned);
  if (!m) return null;
  const whole = BigInt(m[1]);
  const frac = (m[2] ?? "").padEnd(digits, "0");
  return whole * 10n ** BigInt(digits) + (digits ? BigInt(frac || "0") : 0n);
}

/** Convert minor units to a major-unit decimal string ("12500.50") for inputs. */
export function minorToMajorString(amountMinor: bigint | number, currency: string): string {
  const digits = minorUnits(currency);
  const v = BigInt(amountMinor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(digits);
  const whole = abs / base;
  const frac = abs % base;
  const s = digits ? `${whole}.${frac.toString().padStart(digits, "0")}` : `${whole}`;
  return neg ? `-${s}` : s;
}

/**
 * Format money for display in the listing's own currency. Uses Intl with the market locale.
 * Whole-unit amounts drop the decimals (₦18,000 rather than ₦18,000.00).
 */
export function formatMoney(amountMinor: bigint | number | null | undefined, currency: string, locale = "en"): string {
  if (amountMinor === null || amountMinor === undefined) return "";
  const digits = minorUnits(currency);
  const v = BigInt(amountMinor);
  const base = 10n ** BigInt(digits);
  const hasFraction = v % base !== 0n;
  // Intl accepts a decimal string, avoiding Number precision loss for large values.
  const major = minorToMajorString(v, currency);
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: hasFraction ? digits : 0,
    maximumFractionDigits: digits,
  });
  return fmt.format(major as unknown as number);
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  return { amountMinor: BigInt(a.amountMinor) + BigInt(b.amountMinor), currency: a.currency };
}
