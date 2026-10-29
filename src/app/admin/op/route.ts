import { NextResponse, type NextRequest } from "next/server";
import { runAdminOp } from "@/app/actions/admin";
import { isSameOrigin } from "@/lib/same-origin";

/** Admin forms post here as plain HTML forms (works with or without JavaScript) and get a 303 back to the page. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const target = await runAdminOp(await request.formData());
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), 303);
}
