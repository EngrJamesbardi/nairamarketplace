import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

export const VIEWER_COOKIE = "nm_vid";

/**
 * Pseudonymous key used only to de-duplicate sponsored impressions/clicks (one per viewer per day).
 * Derived on the server from the signed-in user id or a random first-party cookie, then hashed with a salt,
 * so the stored value cannot be linked back to a person without the server secret.
 */
export async function viewerKey(userId: string | null | undefined): Promise<string> {
  const jar = await cookies();
  let base = userId ? `u:${userId}` : null;
  if (!base) {
    let vid = jar.get(VIEWER_COOKIE)?.value;
    if (!vid || !/^[0-9a-f-]{36}$/.test(vid)) {
      vid = randomUUID();
      jar.set(VIEWER_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
    }
    base = `a:${vid}`;
  }
  const salt = process.env.ANALYTICS_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-salt";
  return createHash("sha256").update(`${salt}|${base}`).digest("hex");
}
