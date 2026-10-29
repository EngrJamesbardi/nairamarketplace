/**
 * Returns `value` only if it is a same-site path ("/something"), otherwise `fallback`.
 * Rejects protocol-relative URLs ("//evil.com") and backslash variants ("/\evil.com"), which browsers
 * and the URL parser treat as a different host, plus control characters.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
