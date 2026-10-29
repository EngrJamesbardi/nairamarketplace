import type { PaymentProvider } from "./types";
import { hmacHex, safeEqualHex } from "./signature";

/**
 * Paystack adapter (NG, GH, KE, ZA). NOT CONFIGURED AND NOT TESTED against Paystack: it needs a Paystack
 * account and PAYSTACK_SECRET_KEY. Written against Paystack's documented API: transaction/initialize,
 * transaction/verify and x-paystack-signature (HMAC-SHA512 of the raw body). Test in Paystack test mode before use.
 */
const API = "https://api.paystack.co";
const key = () => process.env.PAYSTACK_SECRET_KEY ?? "";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !json.status) throw new Error(`Paystack: ${json.message ?? res.status}`);
  return json.data;
}

export const paystackProvider: PaymentProvider = {
  key: "paystack",
  label: "Paystack",
  configured: () => key().startsWith("sk_"),
  async createCheckout(input) {
    const data = await call<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor, // Paystack expects the amount in the currency's subunit
        currency: input.currency,
        reference: input.reference,
        callback_url: input.returnUrl,
        metadata: { description: input.description },
      }),
    });
    return { url: data.authorization_url };
  },
  async parseWebhook(rawBody, headers) {
    if (!this.configured()) return null;
    if (!safeEqualHex(headers.get("x-paystack-signature"), hmacHex("sha512", key(), rawBody))) return null;
    const body = JSON.parse(rawBody) as { event: string; data: { id: number; reference: string; amount: number; currency: string; status: string; gateway_response?: string } };
    if (body.event !== "charge.success") {
      return { eventId: `${body.event}:${body.data?.id}`, type: body.event, reference: body.data?.reference, outcome: "ignored", amountMinor: 0, currency: "", providerTransactionId: String(body.data?.id ?? ""), payload: body };
    }
    // Defence in depth: confirm with Paystack's API rather than trusting the callback body alone.
    const tx = await call<{ id: number; status: string; amount: number; currency: string; reference: string; gateway_response: string }>(
      `/transaction/verify/${encodeURIComponent(body.data.reference)}`,
    );
    return {
      eventId: `charge.success:${tx.id}`,
      type: body.event,
      reference: tx.reference,
      outcome: tx.status === "success" ? "succeeded" : "failed",
      amountMinor: tx.amount,
      currency: tx.currency,
      providerTransactionId: String(tx.id),
      failureReason: tx.status === "success" ? undefined : tx.gateway_response,
      payload: body,
    };
  },
};
