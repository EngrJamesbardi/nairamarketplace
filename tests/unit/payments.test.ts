import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.MOCK_PAYMENT_WEBHOOK_SECRET = "unit-test-secret-0123456789";
  process.env.PAYMENTS_ENABLED_PROVIDERS = "mock";
  process.env.PAYSTACK_SECRET_KEY = "";
});

const body = (o: object = {}) =>
  JSON.stringify({ id: "evt_1", type: "charge.success", data: { reference: "NM-ABC", amount: 250000, currency: "NGN", transaction_id: "tx_1" }, ...o });

describe("mock payment provider", () => {
  it("accepts a correctly signed webhook", async () => {
    const { mockProvider, signMockEvent, MOCK_SIGNATURE_HEADER } = await import("@/lib/payments/mock");
    const raw = body();
    const ev = await mockProvider.parseWebhook(raw, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockEvent(raw) }));
    expect(ev).toMatchObject({ eventId: "evt_1", reference: "NM-ABC", outcome: "succeeded", amountMinor: 250000, currency: "NGN" });
  });

  it("rejects a missing, wrong or stale signature", async () => {
    const { mockProvider, signMockEvent, MOCK_SIGNATURE_HEADER } = await import("@/lib/payments/mock");
    const raw = body();
    expect(await mockProvider.parseWebhook(raw, new Headers())).toBeNull();
    expect(await mockProvider.parseWebhook(raw, new Headers({ [MOCK_SIGNATURE_HEADER]: "00".repeat(32) }))).toBeNull();
    expect(await mockProvider.parseWebhook(raw, new Headers({ [MOCK_SIGNATURE_HEADER]: "not-hex" }))).toBeNull();
    // signature of a different body (e.g. amount tampered after signing)
    const tampered = body({ data: { reference: "NM-ABC", amount: 1, currency: "NGN", transaction_id: "tx_1" } });
    expect(await mockProvider.parseWebhook(tampered, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockEvent(raw) }))).toBeNull();
  });

  it("maps declines to failed", async () => {
    const { mockProvider, signMockEvent, MOCK_SIGNATURE_HEADER } = await import("@/lib/payments/mock");
    const raw = body({ type: "charge.failed" });
    const ev = await mockProvider.parseWebhook(raw, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockEvent(raw) }));
    expect(ev?.outcome).toBe("failed");
  });

  it("is unavailable without a strong secret", async () => {
    const { mockProvider } = await import("@/lib/payments/mock");
    const saved = process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
    process.env.MOCK_PAYMENT_WEBHOOK_SECRET = "short";
    expect(mockProvider.configured()).toBe(false);
    process.env.MOCK_PAYMENT_WEBHOOK_SECRET = saved;
  });

  it("rejects the .env.example placeholder secret", async () => {
    const { mockProvider } = await import("@/lib/payments/mock");
    vi.stubEnv("MOCK_PAYMENT_WEBHOOK_SECRET", "change-me-dev-only");
    expect(mockProvider.configured()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("is refused in production unless explicitly allowed", async () => {
    const { mockProvider } = await import("@/lib/payments/mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(mockProvider.configured()).toBe(false);
    vi.stubEnv("ALLOW_MOCK_PAYMENTS", "true");
    expect(mockProvider.configured()).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("provider registry", () => {
  it("only returns providers that are enabled and configured", async () => {
    const { getProvider } = await import("@/lib/payments");
    expect(getProvider("mock")?.key).toBe("mock");
    expect(getProvider("paystack")).toBeNull(); // not enabled, no credentials
    expect(getProvider("unknown")).toBeNull();
    expect(getProvider(null)).toBeNull();
  });
});

describe("paystack adapter", () => {
  it("rejects webhooks when not configured", async () => {
    const { paystackProvider } = await import("@/lib/payments/paystack");
    expect(paystackProvider.configured()).toBe(false);
    expect(await paystackProvider.parseWebhook("{}", new Headers({ "x-paystack-signature": "ab" }))).toBeNull();
  });
});
