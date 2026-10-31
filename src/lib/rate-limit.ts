/**
 * Fixed-window rate limiter for server actions and route handlers.
 *
 * With UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set, counters live in Upstash Redis and are shared by every
 * server instance (needed on Vercel, which runs many instances). Without them, or if Redis can't be reached, counters
 * fall back to this instance's memory, which is fine for one server or local development.
 * Database-level limits (messages, offers, reports, listings) are enforced separately in Postgres.
 */
type Bucket = { count: number; resetAt: number };
type Result = { ok: boolean; retryAfterMs: number };
const buckets = new Map<string, Bucket>();

// RATE_LIMIT_SCALE lets local test runs raise limits (e.g. 50). Never set it in production.
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1) || 1);
const REDIS_TIMEOUT_MS = 1500;

function memoryLimit(key: string, limit: number, windowMs: number): Result {
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

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** INCR + set the window's expiry on first hit + read the remaining time, in one round trip. Null on any failure. */
async function redisLimit(cfg: { url: string; token: string }, key: string, limit: number, windowMs: number): Promise<Result | null> {
  const k = `nm:rl:${key}`;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", k], ["PEXPIRE", k, String(windowMs), "NX"], ["PTTL", k]]),
      cache: "no-store",
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    const count = Number(out?.[0]?.result);
    const ttl = Number(out?.[2]?.result);
    if (!Number.isFinite(count) || out.some((r) => r?.error)) return null;
    return count <= limit ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: ttl > 0 ? ttl : windowMs };
  } catch {
    return null;
  }
}

export async function rateLimit(key: string, baseLimit: number, windowMs: number): Promise<Result> {
  const limit = baseLimit * SCALE;
  const cfg = redisConfig();
  if (cfg) {
    const shared = await redisLimit(cfg, key, limit, windowMs);
    if (shared) return shared;
  }
  return memoryLimit(key, limit, windowMs);
}

export function _resetRateLimits() {
  buckets.clear();
}
