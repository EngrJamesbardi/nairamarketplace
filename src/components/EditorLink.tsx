/**
 * Link into the listing editor (/dashboard/listings/[id]/edit) that always loads the page in full.
 *
 * With next/link, Next.js 15.5 (App Router, production builds) can leave the click doing nothing: the editor's RSC
 * payload and scripts arrive, but the router suspends forever on its internal `unresolvedThenable` and never commits.
 * It happens when the editor's client chunks are already in the tab's in-memory cache, e.g. after the seller opened
 * the new-listing page earlier in the same tab (the editor and that page share ListingForm). A full page load is
 * unaffected, and the editor is a form page whose own save already finishes with a full load (window.location.assign).
 * Covered by tests/e2e/draft-editor.spec.ts.
 */
export function EditorLink({ listingId, className, children }: { listingId: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={`/dashboard/listings/${encodeURIComponent(listingId)}/edit`} className={className}>
      {children}
    </a>
  );
}
