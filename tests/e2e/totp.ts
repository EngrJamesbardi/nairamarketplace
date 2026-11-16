import { createHmac } from "node:crypto";

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the same as authenticator apps compute. Test use only. */
export function totp(base32Secret: string, at = Date.now(), stepOffset = 0): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32Secret.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const ch of clean) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Math.floor(at / 1000 / 30) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}
