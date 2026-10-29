import { describe, it, expect } from "vitest";
import { parseToMinor, minorToMajorString, formatMoney, addMoney } from "@/lib/money";

describe("money", () => {
  it("parses major-unit strings to exact minor units", () => {
    expect(parseToMinor("18,000", "NGN")).toBe(1800000n);
    expect(parseToMinor("12500.5", "GHS")).toBe(1250050n);
    expect(parseToMinor("0.1", "KES")).toBe(10n);
    expect(parseToMinor("₦ 1,000", "NGN")).toBe(100000n);
    // float trap: 0.1 + 0.2 style values remain exact
    expect(parseToMinor("19.99", "ZAR")).toBe(1999n);
  });
  it("rejects invalid input", () => {
    expect(parseToMinor("abc", "NGN")).toBeNull();
    expect(parseToMinor("1.234", "NGN")).toBeNull();
    expect(parseToMinor("-5", "NGN")).toBeNull();
    expect(parseToMinor("", "NGN")).toBeNull();
  });
  it("round-trips minor to major strings", () => {
    expect(minorToMajorString(1800000, "NGN")).toBe("18000.00");
    expect(minorToMajorString(5n, "NGN")).toBe("0.05");
  });
  it("formats each market currency without hard-coding the naira sign", () => {
    expect(formatMoney(1800000, "NGN", "en-NG")).toBe("₦18,000");
    expect(formatMoney(450000, "GHS", "en-GH")).toMatch(/^(GH₵|₵)4,500$/);
    expect(formatMoney(250050, "KES", "en-KE")).toMatch(/2,500\.50$/);
    expect(formatMoney(1999, "ZAR", "en-ZA")).toMatch(/^R\s?19[.,]99$/);
  });
  it("formats very large values without precision loss", () => {
    expect(formatMoney(900719925474099312n, "NGN", "en-NG")).toBe("₦9,007,199,254,740,993.12");
  });
  it("refuses to add different currencies", () => {
    expect(() => addMoney({ amountMinor: 1, currency: "NGN" }, { amountMinor: 1, currency: "GHS" })).toThrow(/Currency mismatch/);
    expect(addMoney({ amountMinor: 1n, currency: "NGN" }, { amountMinor: 2, currency: "NGN" }).amountMinor).toBe(3n);
  });
});
