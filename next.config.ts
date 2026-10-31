import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// The demo site (NEXT_PUBLIC_SITE_MODE=demo) also tells crawlers not to index any response, including images and API routes.
const demoHeaders = process.env.NEXT_PUBLIC_SITE_MODE === "demo" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the workspace root so a stray lockfile in a parent folder (e.g. ~/package-lock.json) isn't picked up.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: [...securityHeaders, ...demoHeaders] },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
