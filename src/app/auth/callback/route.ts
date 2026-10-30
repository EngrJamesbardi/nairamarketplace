import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-path";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Handles email verification, magic links and password-recovery redirects from Supabase Auth.
 * Email templates (supabase/templates) link here with a token hash, verified server-side. `code` is still
 * accepted for PKCE links, which only work in the browser that started the flow and expire after 5 minutes.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type") as EmailOtpType | null;
  const type = rawType && OTP_TYPES.includes(rawType) ? rawType : null;
  const next = safeNextPath(url.searchParams.get("next"));
  const supabase = await createClient();

  let error: string | null = "missing";
  if (tokenHash && type) error = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error?.message ?? null;
  else if (code) error = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;

  if (!error) return NextResponse.redirect(new URL(next, url.origin));

  console.warn(`[auth/callback] ${type ?? (code ? "pkce" : "unknown")} link rejected: ${error}`);
  const dest = type === "recovery" ? "/auth/forgot?error=link" : "/auth/login?error=link";
  return NextResponse.redirect(new URL(dest, url.origin));
}
