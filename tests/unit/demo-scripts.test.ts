import { describe, expect, it } from "vitest";
import * as lib from "../../scripts/demo/lib.mjs";

const REF = "abcdefghijklmnopqrst";
const URL_ = `https://${REF}.supabase.co`;

describe("demo target guard", () => {
  it("accepts the demo project only when the typed reference matches and seed data exists", () => {
    expect(lib.checkDemoTarget({ url: URL_, confirmRef: REF, seedProfileCount: 6 })).toEqual({ ok: true, ref: REF });
  });
  it("refuses a mismatched or missing reference", () => {
    expect(lib.checkDemoTarget({ url: URL_, confirmRef: "zzzzzzzzzzzzzzzzzzzz", seedProfileCount: 6 }).ok).toBe(false);
    expect(lib.checkDemoTarget({ url: URL_, confirmRef: undefined, seedProfileCount: 6 }).ok).toBe(false);
  });
  it("refuses a project without seed data (production)", () => {
    expect(lib.checkDemoTarget({ url: URL_, confirmRef: REF, seedProfileCount: 0 }).ok).toBe(false);
  });
  it("refuses local and non-Supabase URLs", () => {
    expect(lib.checkDemoTarget({ url: "http://127.0.0.1:54321", confirmRef: REF, seedProfileCount: 6 }).ok).toBe(false);
    expect(lib.checkDemoTarget({ url: `http://${REF}.supabase.co`, confirmRef: REF, seedProfileCount: 6 }).ok).toBe(false);
  });
});

describe("export guard", () => {
  it("only treats local addresses as local", () => {
    expect(lib.isLocalUrl("http://127.0.0.1:54321")).toBe(true);
    expect(lib.isLocalUrl("http://localhost:54321")).toBe(true);
    expect(lib.isLocalUrl(URL_)).toBe(false);
    expect(lib.isLocalUrl("not a url")).toBe(false);
  });
});

describe("seed account detection", () => {
  const seedIds = new Set(["a"]);
  it("needs both the seed email domain and a seed profile", () => {
    expect(lib.isSeedAccount({ id: "a", email: "admin@naira.test" }, seedIds)).toBe(true);
    expect(lib.isSeedAccount({ id: "a", email: "ADMIN@NAIRA.TEST" }, seedIds)).toBe(true);
    expect(lib.isSeedAccount({ id: "b", email: "friend@naira.test" }, seedIds)).toBe(false);
    expect(lib.isSeedAccount({ id: "a", email: "someone@example.com" }, seedIds)).toBe(false);
  });
});

describe("random secrets", () => {
  it("makes long, unique passwords that are never the public seed password", () => {
    const a = lib.randomPassword();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(lib.randomPassword());
    expect(a).not.toBe(lib.PUBLIC_SEED_PASSWORD);
    expect(lib.demoSellerEmail()).toMatch(/^demo-seller-[0-9a-f]{8}@naira\.test$/);
  });
});

describe("listing copy", () => {
  const exported = {
    source_id: "7c1950f9-0000-0000-0000-000000000000",
    category_slug: "phones-electronics",
    listing: {
      id: "old-id", seller_id: "old-seller", title: "laptop", description: "A laptop in good condition", price_minor: 100,
      currency: "NGN", price_type: "fixed", condition: "used_good", country_code: "NG", city: "benin",
      view_count: 99, moderation_status: "removed", is_seed: false, attributes: { colour: "black" },
    },
  };
  it("copies only allowed fields, sets a fresh owner and marks it as demo data", () => {
    const row = lib.buildListingRow(exported, { sellerId: "new-seller", regionId: 9, areaId: null, categoryId: 1, subcategoryId: 2 });
    expect(row.seller_id).toBe("new-seller");
    expect(row.is_seed).toBe(true);
    expect(row.status).toBe("active");
    expect(row.attributes).toEqual({ colour: "black", demo_source_id: exported.source_id });
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("view_count");
    expect(row).not.toHaveProperty("moderation_status");
  });
  it("refuses an unknown category", () => {
    expect(() => lib.buildListingRow(exported, { sellerId: "s", regionId: null, areaId: null, categoryId: null, subcategoryId: null })).toThrow(/Category/);
  });
  it("re-homes photos under the new owner's folder and rejects odd file names", () => {
    expect(lib.demoImagePath("new-seller", "c0c03ebd/9f1f1d0f.webp")).toBe("new-seller/9f1f1d0f.webp");
    expect(() => lib.demoImagePath("s", "x/..")).toThrow();
    expect(() => lib.demoImagePath("s", "x/a b.webp")).toThrow();
  });
});

describe("argument parsing", () => {
  it("collects repeated flags", () => {
    expect(lib.parseArgs(["--listing", "a", "--listing", "b", "--out", "d"])).toEqual({ listing: ["a", "b"], out: "d" });
  });
});

describe("seed password check", () => {
  it("counts the password as dead only when Supabase rejects the credentials", () => {
    expect(lib.classifySignInProbe({ data: { session: null }, error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } })).toBe("rejected");
    expect(lib.classifySignInProbe({ data: {}, error: { message: "Invalid login credentials" } })).toBe("rejected");
  });
  it("never treats a rate limit or network error as proof", () => {
    expect(lib.classifySignInProbe({ data: {}, error: { code: "over_request_rate_limit", message: "Request rate limit reached", status: 429 } })).toBe("unknown");
    expect(lib.classifySignInProbe({ data: {}, error: { message: "fetch failed" } })).toBe("unknown");
    expect(lib.classifySignInProbe({ data: {}, error: null })).toBe("unknown");
  });
  it("reports a successful sign-in as still working", () => {
    expect(lib.classifySignInProbe({ data: { session: { access_token: "x" } }, error: null })).toBe("accepted");
  });
});
