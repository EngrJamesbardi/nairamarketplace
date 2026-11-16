import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every route is rendered per request (no SSG/ISR), so no incremental cache (R2/KV) or tag cache (D1) is needed.
// See docs/DEPLOYMENT_CLOUDFLARE.md before adding one.
export default defineCloudflareConfig({});
