import "server-only";
import { getProvider } from "@/lib/payments";

export type PendingPayment = { reference: string; provider: string; amount_minor: number; currency: string; description: string };

/**
 * Hands a pending platform payment (created by start_checkout / start_promotion_checkout) to its provider and returns the
 * hosted payment page URL. Nothing is granted here: only the verified provider webhook completes a payment.
 */
export async function providerCheckoutUrl(pay: PendingPayment, email: string, origin: string): Promise<{ url: string } | { error: string }> {
  const provider = getProvider(pay.provider);
  if (!provider) return { error: "Payments are not available in your market yet." };
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL || origin;
    const { url } = await provider.createCheckout({
      reference: pay.reference,
      amountMinor: Number(pay.amount_minor),
      currency: pay.currency,
      email,
      description: pay.description,
      returnUrl: `${site}/pay/return?ref=${encodeURIComponent(pay.reference)}`,
    });
    return { url };
  } catch (e) {
    console.error("checkout failed", (e as Error).message);
    return { error: "The payment provider is unavailable. Please try again later." };
  }
}
