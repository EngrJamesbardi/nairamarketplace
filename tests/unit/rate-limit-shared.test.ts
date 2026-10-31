import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, _resetRateLimits } from "@/lib/rate-limit";

/** A tiny in-memory stand-in for Upstash's REST /pipeline endpoint (INCR, PEXPIRE NX, PTTL). */
function fakeUpstash() {
  const store = new Map<string, { n: number; expiresAt: number | null }>();
  const calls: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, auth: (init.headers as Record<string, string>).Authorization });
    const cmds = JSON.parse(String(init.body)) as string[][];
    const out = cmds.map(([cmd, key, arg]) => {
      const e = store.get(key) ?? { n: 0, expiresAt: null };
      if (cmd === "INCR") { e.n += 1; store.set(key, e); return { result: e.n }; }
      if (cmd === "PEXPIRE") { if (e.expiresAt === null) e.expiresAt = Date.now() + Number(arg); return { result: 1 }; }
      if (cmd === "PTTL") return { result: e.expiresAt ? e.expiresAt - Date.now() : -1 };
      return { error: "unknown" };
    });
    return new Response(JSON.stringify(out), { status: 200 });
  });
  return { fetchMock, calls, store };
}

describe("shared rate limiting (Upstash)", () => {
  beforeEach(() => {
    _resetRateLimits();
    process.env.UPSTASH_REDIS_REST_URL = "https://example-redis.upstash.io/";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  });
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.unstubAllGlobals();
  });

  it("counts in Redis and blocks after the limit", async () => {
    const { fetchMock, calls } = fakeUpstash();
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 2; i++) expect((await rateLimit("signin:1.2.3.4", 2, 60000)).ok).toBe(true);
    const blocked = await rateLimit("signin:1.2.3.4", 2, 60000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(calls[0]).toEqual({ url: "https://example-redis.upstash.io/pipeline", auth: "Bearer test-token" });
  });

  it("shares counts across instances (memory is not used when Redis answers)", async () => {
    const { fetchMock } = fakeUpstash();
    vi.stubGlobal("fetch", fetchMock);
    expect((await rateLimit("k", 1, 60000)).ok).toBe(true);
    _resetRateLimits(); // a different instance has empty memory
    expect((await rateLimit("k", 1, 60000)).ok).toBe(false);
  });

  it("falls back to memory when Redis fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect((await rateLimit("k", 1, 60000)).ok).toBe(true);
    expect((await rateLimit("k", 1, 60000)).ok).toBe(false);
  });
});
