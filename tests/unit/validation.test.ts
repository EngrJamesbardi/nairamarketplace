import { describe, it, expect } from "vitest";
import { listingSchema, signUpSchema, sniffImageType, sellerOnboardingSchema, requiredPhotos, MAX_IMAGES } from "@/lib/validation";
import { normalisePhone, countryFlag } from "@/lib/countries";
import { rateLimit, _resetRateLimits } from "@/lib/rate-limit";
import { friendlyError } from "@/lib/errors";

const base = { title: "Phone", description: "A good phone in great shape", categoryId: "1", priceType: "fixed", price: "1,500", currency: "NGN", condition: "new", quantity: "1", deliveryOptions: ["local_pickup"], status: "active" };

describe("listing validation", () => {
  it("converts the price to minor units", () => {
    const r = listingSchema.safeParse(base);
    expect(r.success && r.data.priceMinor).toBe(150000n);
  });
  it("requires a price unless contact-for-price", () => {
    expect(listingSchema.safeParse({ ...base, price: "" }).success).toBe(false);
    const r = listingSchema.safeParse({ ...base, priceType: "contact", price: "" });
    expect(r.success && r.data.priceMinor).toBe(null);
  });
  it("rejects unknown enums and short titles", () => {
    expect(listingSchema.safeParse({ ...base, condition: "mint" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, title: "x" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, deliveryOptions: [] }).success).toBe(false);
  });
});

describe("auth validation", () => {
  it("enforces password rules and terms acceptance", () => {
    const ok = { displayName: "Ada", email: "Ada@Example.com", password: "secret123", countryCode: "NG", acceptTerms: "on" };
    const r = signUpSchema.safeParse(ok);
    expect(r.success && r.data.email).toBe("ada@example.com");
    expect(signUpSchema.safeParse({ ...ok, password: "short1" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, password: "lettersonly" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, acceptTerms: undefined }).success).toBe(false);
  });
});

describe("seller onboarding validation", () => {
  it("validates shop slug format", () => {
    const v = { shopName: "My Shop", slug: "my-shop", sellerType: "individual", countryCode: "NG", deliveryOptions: ["local_pickup"] };
    expect(sellerOnboardingSchema.safeParse(v).success).toBe(true);
    expect(sellerOnboardingSchema.safeParse({ ...v, slug: "My Shop!" }).success).toBe(false);
    expect(sellerOnboardingSchema.safeParse({ ...v, sellerType: "corporation" }).success).toBe(false);
  });
});

describe("upload sniffing", () => {
  it("detects real image types by magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("MZ executable"))).toBeNull();
  });
});

describe("phone numbers per country", () => {
  const NG = { phone_prefix: "+234", phone_pattern: "^[789][01][0-9]{8}$" };
  const KE = { phone_prefix: "+254", phone_pattern: "^[17][0-9]{8}$" };
  it("normalises local formats to E.164", () => {
    expect(normalisePhone("0803 123 4567", NG)).toBe("+2348031234567");
    expect(normalisePhone("+2348031234567", NG)).toBe("+2348031234567");
    expect(normalisePhone("0712 345678", KE)).toBe("+254712345678");
  });
  it("rejects numbers from another country or invalid", () => {
    expect(normalisePhone("+254712345678", NG)).toBeNull();
    expect(normalisePhone("12345", NG)).toBeNull();
  });
  it("renders flags", () => expect(countryFlag("NG")).toBe("🇳🇬"));
});

describe("rate limiting", () => {
  it("blocks after the limit within the window", async () => {
    _resetRateLimits();
    for (let i = 0; i < 3; i++) expect((await rateLimit("k", 3, 60000)).ok).toBe(true);
    expect((await rateLimit("k", 3, 60000)).ok).toBe(false);
    expect((await rateLimit("other", 3, 60000)).ok).toBe(true);
  });
});

describe("error messages", () => {
  it("passes through friendly DB messages but hides internals", () => {
    expect(friendlyError({ code: "P0409", message: "This offer has expired" })).toBe("This offer has expired");
    expect(friendlyError({ code: "42501", message: 'new row violates row-level security policy for table "listings"' })).toBe("You do not have permission to do that.");
    expect(friendlyError({ code: "XX000", message: "internal" })).toMatch(/Something went wrong/);
  });
});

describe("photo requirements", () => {
  it("needs the category minimum to publish", () => {
    expect(requiredPhotos(4, { publishing: true, savedCount: 0 })).toBe(4);
    expect(requiredPhotos(2, { publishing: true, savedCount: 0 })).toBe(2);
    expect(requiredPhotos(40, { publishing: true, savedCount: 0 })).toBe(MAX_IMAGES);
  });
  it("never forces extra photos onto a listing that is already live", () => {
    expect(requiredPhotos(4, { publishing: false, savedCount: 1 })).toBe(1);
    expect(requiredPhotos(4, { publishing: false, savedCount: 6 })).toBe(4);
    expect(requiredPhotos(4, { publishing: false, savedCount: 0 })).toBe(1);
  });
  it("allows up to 10 photos per listing", () => expect(MAX_IMAGES).toBe(10));
});

describe("listing location", () => {
  const base = { title: "Samsung TV", description: "Working television, 43 inch", categoryId: "1", priceType: "fixed", price: "150000", currency: "NGN",
    condition: "used_good", quantity: "1", deliveryOptions: ["local_pickup"], status: "active" };
  it("accepts a state and LGA", () => {
    const r = listingSchema.safeParse({ ...base, regionId: "5", areaId: "42" });
    expect(r.success && r.data.regionId === 5 && r.data.areaId === 42).toBe(true);
  });
  it("rejects an LGA without a state", () => {
    const r = listingSchema.safeParse({ ...base, areaId: "42" });
    expect(r.success).toBe(false);
  });
  it("accepts a state without an LGA (markets without LGAs, drafts)", () => {
    expect(listingSchema.safeParse({ ...base, regionId: "5", areaId: "" }).success).toBe(true);
  });
});
