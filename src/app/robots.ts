import type { MetadataRoute } from "next";
import { isDemoSite } from "@/lib/site-mode";

export default function robots(): MetadataRoute.Robots {
  // The demo site must never appear in search results.
  if (isDemoSite()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/dashboard", "/account", "/messages", "/favourites", "/following", "/notifications", "/onboarding", "/pay", "/auth", "/api"],
    },
  };
}
