import type { PaymentProvider, WebhookEvent } from "./types";
import { hmacHex, safeEqualHex } from "./signature";

/**
 * DEVELOPMENT MOCK. Simulates a hosted checkout and a signed provider webhook so the full flow
 * (checkout -> signed callback -> server verification -> ledger) can be exercised without a real provider.
 * Enabled only when PAYMENTS_ENABLED_PROVIDERS includes "mock" and MOCK_PAYMENT_WEBHOOK_SECRET is set (see mockAllowed()).
 */
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

export type MockEventBody = {
  id: string;
  type: "charge.success" | "charge.failed";
  data: { reference: string; amount: number; currency: string; transaction_id: string; reason?: string };
};

function secret() {
  return process.env.MOCK_PAYMENT_WEBHOOK_SECRET ?? "";
}

/**
 * Anyone who knows the secret can mint credits, so the placeholder from .env.example never counts, and a production
 * build (`next start`, any host) refuses the mock unless ALLOW_MOCK_PAYMENTS=true is set on purpose for a private test.
 */
function mockAllowed() {
  const s = secret();
  if (s.length < 16 || s === "change-me-dev-only") return false;
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAYMENTS === "true";
}

export function signMockEvent(body: string): string {
  return hmacHex("sha256", secret(), body);
}

export const mockProvider: PaymentProvider = {
  key: "mock",
  label: "Mock payments (development only)",
  configured: () => mockAllowed(),
  async createCheckout(input) {
    return { url: `/pay/mock/${encodeURIComponent(input.reference)}` };
  },
  async parseWebhook(rawBody, headers) {
    if (!this.configured()) return null;
    if (!safeEqualHex(headers.get(MOCK_SIGNATURE_HEADER), signMockEvent(rawBody))) return null;
    let body: MockEventBody;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!body?.id || !body.data?.reference) return null;
    const ev: WebhookEvent = {
      eventId: body.id,
      type: body.type,
      reference: body.data.reference,
      outcome: body.type === "charge.success" ? "succeeded" : body.type === "charge.failed" ? "failed" : "ignored",
      amountMinor: Number(body.data.amount),
      currency: String(body.data.currency),
      providerTransactionId: body.data.transaction_id,
      failureReason: body.data.reason,
      payload: body,
    };
    return ev;
  },
};
