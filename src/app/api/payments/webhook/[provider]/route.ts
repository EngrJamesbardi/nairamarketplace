import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getProvider } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Provider callbacks. The ONLY path that completes a payment and grants credits or a plan:
 * signature verified here -> complete_payment() (service role, idempotent, checks amount + currency).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: key } = await params;
  const provider = getProvider(key);
  if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 100_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const db = createAdminClient();

  let event;
  try {
    event = await provider.parseWebhook(raw, request.headers);
  } catch (e) {
    console.error("webhook verification error", (e as Error).message);
    return NextResponse.json({ error: "Verification unavailable" }, { status: 503 }); // provider will retry
  }
  if (!event) {
    await db.rpc("record_payment_event", {
      p_provider: key, p_event_id: `invalid:${createHash("sha256").update(raw).digest("hex").slice(0, 40)}`, p_reference: "", p_type: "invalid_signature",
      p_valid: false, p_result: "rejected", p_payload: {},
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let result = "ignored";
  if (event.outcome === "succeeded") {
    const { data, error } = await db.rpc("complete_payment", {
      p_provider: key, p_reference: event.reference, p_amount_minor: event.amountMinor, p_currency: event.currency, p_provider_tx: event.providerTransactionId,
    });
    if (error) return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // safe to retry: idempotent
    result = data as string;
  } else if (event.outcome === "failed") {
    const { data, error } = await db.rpc("fail_payment", { p_provider: key, p_reference: event.reference, p_reason: event.failureReason ?? "Declined" });
    if (error) return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    result = data as string;
  }
  await db.rpc("record_payment_event", {
    p_provider: key, p_event_id: event.eventId, p_reference: event.reference, p_type: event.type, p_valid: true, p_result: result,
    p_payload: event.payload as never,
  });
  return NextResponse.json({ received: true, result });
}
