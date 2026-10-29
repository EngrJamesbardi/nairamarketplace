import "server-only";
import type { PaymentProvider } from "./types";
import { mockProvider } from "./mock";
import { paystackProvider } from "./paystack";

const ALL: Record<string, PaymentProvider> = { mock: mockProvider, paystack: paystackProvider };

/** Providers switched on for this deployment (PAYMENTS_ENABLED_PROVIDERS, comma-separated). */
export function enabledProviderKeys(): string[] {
  return (process.env.PAYMENTS_ENABLED_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** A provider that is enabled for this deployment AND has its credentials, or null. */
export function getProvider(key: string | null | undefined): PaymentProvider | null {
  if (!key) return null;
  const p = ALL[key];
  if (!p || !enabledProviderKeys().includes(key) || !p.configured()) return null;
  return p;
}

export function providerStatus() {
  return Object.values(ALL).map((p) => ({ key: p.key, label: p.label, enabled: enabledProviderKeys().includes(p.key), configured: p.configured() }));
}

export type { PaymentProvider, WebhookEvent, CheckoutInput } from "./types";
