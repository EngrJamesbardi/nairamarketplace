import "server-only";
import { headers } from "next/headers";

/**
 * The visitor's IP address, for rate limits and pseudonymous viewer keys.
 * On Cloudflare, CF-Connecting-IP is set by Cloudflare and cannot be supplied by the visitor, whereas the first
 * X-Forwarded-For entry can be. Elsewhere (Vercel, local) the header is absent and X-Forwarded-For is used as before.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}
