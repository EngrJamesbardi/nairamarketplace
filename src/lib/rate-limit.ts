/**
 * In-memory fixed-window rate limiter for server actions and route handlers.
 * Suitable for a single instance / local development. In production on multiple instances,
 * back this with a shared store (e.g. Redis/Upstash) — see docs/DEPLOYMENT.md.
 * Database-level limits (messages, offers, reports, listings) are enforced separately in Postgres.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// RATE_LIMIT_SCALE lets local test runs raise limits (e.g. 50). Never set it in production.
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1) || 1);

export function rateLimit(key: string, baseLimit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const limit = baseLimit * SCALE;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfterMs: b.resetAt - now };
  b.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function _resetRateLimits() {
  buckets.clear();
}
