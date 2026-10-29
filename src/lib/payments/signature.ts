import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacHex(algorithm: "sha256" | "sha512", secret: string, body: string): string {
  return createHmac(algorithm, secret).update(body, "utf8").digest("hex");
}

/** Constant-time comparison of two hex signatures. */
export function safeEqualHex(a: string | null | undefined, b: string): boolean {
  if (!a || a.length !== b.length || !/^[0-9a-f]+$/i.test(a)) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase(), "hex"), Buffer.from(b.toLowerCase(), "hex"));
}
