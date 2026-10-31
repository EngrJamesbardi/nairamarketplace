/**
 * Which deployment this is. "demo" is the public test site (demo.nairamarketplace.com): it shows a banner on every page
 * and asks search engines not to index anything. Anything else is treated as production.
 * NEXT_PUBLIC_ values are fixed at build time, so change it in Vercel and redeploy.
 */
export function isDemoSite(): boolean {
  return process.env.NEXT_PUBLIC_SITE_MODE === "demo";
}
