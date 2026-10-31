import { isDemoSite } from "@/lib/site-mode";

/** Shown on every page of the demo site so nobody mistakes test data for real items. */
export function DemoBanner() {
  if (!isDemoSite()) return null;
  return (
    <div role="note" aria-label="Demo site" data-testid="demo-banner" className="bg-ink px-4 py-2 text-center text-sm text-canvas">
      <strong>Demo site.</strong> Test data only: nothing here is for sale, and accounts and listings may be wiped at any time.
    </div>
  );
}
