import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/payments";
import { signMockEvent, MOCK_SIGNATURE_HEADER, type MockEventBody } from "@/lib/payments/mock";
import { isSameOrigin } from "@/lib/same-origin";

/**
 * Plays the role of the provider: sends a signed webhook to our own webhook endpoint, server-to-server,
 * exactly as a real provider would. The member's browser only ever sees the return page.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!getProvider("mock") || !isSameOrigin(request)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  const { data: p } = await supabase.from("platform_payments").select("reference, amount_minor, currency, provider, status").eq("reference", reference).maybeSingle();
  if (!p || p.provider !== "mock") return new NextResponse("Not found", { status: 404 });

  const outcome = (await request.formData()).get("outcome") === "success" ? "charge.success" : "charge.failed";
  const event: MockEventBody = {
    id: `evt_${randomUUID()}`,
    type: outcome,
    data: { reference: p.reference, amount: Number(p.amount_minor), currency: p.currency, transaction_id: `mock_${randomUUID().slice(0, 12)}`, reason: outcome === "charge.failed" ? "Simulated decline" : undefined },
  };
  const body = JSON.stringify(event);
  const res = await fetch(new URL("/api/payments/webhook/mock", request.nextUrl.origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", [MOCK_SIGNATURE_HEADER]: signMockEvent(body) },
    body,
    cache: "no-store",
  });
  if (!res.ok) console.error("mock webhook delivery failed", res.status);
  return NextResponse.redirect(new URL(`/pay/return?ref=${encodeURIComponent(reference)}`, request.nextUrl.origin), 303);
}
