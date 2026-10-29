import type { NextRequest } from "next/server";

/**
 * CSRF guard for plain-form POST route handlers. Auth cookies are SameSite=Lax (not sent on cross-site POSTs);
 * additionally, when the browser sends an Origin header it must be this site.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}
