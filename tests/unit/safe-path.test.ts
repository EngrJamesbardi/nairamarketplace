import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/safe-path";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/search?q=radio&page=2")).toBe("/search?q=radio&page=2");
  });

  it("rejects other sites, including backslash tricks the URL parser treats as a host", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "/\tevil", "", null, undefined, 42]) {
      expect(safeNextPath(bad)).toBe("/");
    }
    expect(new URL("/\\evil.com", "https://naira.example").host).toBe("evil.com"); // why backslashes must be rejected
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//evil.com", "/dashboard?welcome=1")).toBe("/dashboard?welcome=1");
  });
});
