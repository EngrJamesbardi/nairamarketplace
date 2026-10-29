import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/payments";
import { isSameOrigin } from "@/lib/same-origin";
import { friendlyError } from "@/lib/errors";

const schema = z.object({ purpose: z.enum(["credits", "subscription"]), item: z.uuid(), back: z.string().regex(/^\/[a-z/-]*$/).default("/dashboard/credits") });

/** Starts a checkout for a credit package or plan and sends the member to the provider's payment page. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const origin = request.nextUrl.origin;
  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return NextResponse.redirect(new URL("/dashboard/credits?error=Invalid+request", origin), 303);
  const { purpose, item, back } = parsed.data;
  const fail = (msg: string) => NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent(msg)}`, origin), 303);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(back)}`, origin), 303);

  const { data, error } = await supabase.rpc("start_checkout", { p_purpose: purpose, p_item: item });
  if (error) return fail(friendlyError(error));
  const pay = data?.[0];
  if (!pay) return fail("Could not start the payment.");
  const provider = getProvider(pay.provider);
  if (!provider) return fail("Payments are not available in your market yet.");
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL || origin;
    const { url } = await provider.createCheckout({
      reference: pay.reference,
      amountMinor: Number(pay.amount_minor),
      currency: pay.currency,
      email: user.email ?? "",
      description: pay.description,
      returnUrl: `${site}/pay/return?ref=${encodeURIComponent(pay.reference)}`,
    });
    return NextResponse.redirect(new URL(url, origin), 303);
  } catch (e) {
    console.error("checkout failed", (e as Error).message);
    return fail("The payment provider is unavailable. Please try again later.");
  }
}
