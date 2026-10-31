import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoBanner } from "@/components/DemoBanner";
import robots from "@/app/robots";

describe("demo site mode", () => {
  afterEach(() => { delete process.env.NEXT_PUBLIC_SITE_MODE; });

  it("shows the Demo site banner and blocks all crawling on the demo", () => {
    process.env.NEXT_PUBLIC_SITE_MODE = "demo";
    const html = renderToStaticMarkup(DemoBanner());
    expect(html).toContain("Demo site.");
    expect(html).toContain("nothing here is for sale");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("shows no banner and allows public pages in production", () => {
    expect(DemoBanner()).toBeNull();
    const rules = robots().rules as { allow: string; disallow: string[] };
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toContain("/admin");
  });
});
