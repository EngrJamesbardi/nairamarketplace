/** Provider-neutral interface for paying for platform services (credits, plans). Never used for goods between members. */
export type CheckoutInput = {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  description: string;
  /** Where the provider sends the member back to. Landing there never grants anything by itself. */
  returnUrl: string;
};

export type WebhookEvent = {
  eventId: string;
  type: string;
  reference: string;
  outcome: "succeeded" | "failed" | "ignored";
  amountMinor: number;
  currency: string;
  providerTransactionId: string;
  failureReason?: string;
  payload: unknown;
};

export interface PaymentProvider {
  key: string;
  label: string;
  /** True when the credentials this provider needs are present. */
  configured(): boolean;
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  /** Verifies the signature (and, where supported, re-queries the provider). Returns null if it cannot be trusted. */
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null>;
}
