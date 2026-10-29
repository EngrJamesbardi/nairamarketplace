import { NextResponse, type NextRequest } from "next/server";
import { runAdminOp } from "@/app/actions/admin";

/**
 * Admin forms post here as plain HTML forms (works with or without JavaScript) and get a 303 back to the page.
 * CSRF: auth cookies are SameSite=Lax (not sent on cross-site POSTs) and the Origin header must match this host.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  const target = await runAdminOp(await request.formData());
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), 303);
}
