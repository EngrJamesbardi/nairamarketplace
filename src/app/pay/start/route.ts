import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { providerCheckoutUrl } from "@/lib/payments/checkout";
import { isSameOrigin } from "@/lib/same-origin";
import { friendlyError } from "@/lib/errors";

const schema = z.object({
  purpose: z.enum(["credits", "subscription", "promotion"]),
  item: z.uuid(),
  listing: z.uuid().optional(),
  back: z.string().regex(/^\/[a-z/-]*$/).default("/dashboard/credits"),
});

/** Starts a checkout for a credit package, a plan or a listing promotion and sends the member to the provider's payment page. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const origin = request.nextUrl.origin;
  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return NextResponse.redirect(new URL("/dashboard/credits?error=Invalid+request", origin), 303);
  const { purpose, item, listing, back } = parsed.data;
  const fail = (msg: string) => NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent(msg)}`, origin), 303);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(back)}`, origin), 303);

  // Prices, currency and duration come from the database catalogue, never from the form.
  const { data, error } =
    purpose === "promotion"
      ? listing
        ? await supabase.rpc("start_promotion_checkout", { p_package: item, p_listing: listing })
        : { data: null, error: { message: "Choose a listing to promote", code: "22023" } }
      : await supabase.rpc("start_checkout", { p_purpose: purpose, p_item: item });
  if (error) return fail(friendlyError(error));
  const pay = data?.[0];
  if (!pay) return fail("Could not start the payment.");
  const res = await providerCheckoutUrl(pay, user.email ?? "", origin);
  if ("error" in res) return fail(res.error);
  return NextResponse.redirect(new URL(res.url, origin), 303);
}
