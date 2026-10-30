import { GridSkeleton } from "@/components/ProductCard";

// Skeleton while search results load. Keep loading boundaries on leaf routes like this one: a root app/loading.tsx
// made Next.js 15.5 client navigations hang (see tests/e2e/navigation.spec.ts).
export default function Loading() {
  return (
    <div className="page" role="status" aria-label="Loading">
      <div className="mb-4 h-7 w-48 animate-pulse rounded bg-line/70" />
      <GridSkeleton />
    </div>
  );
}
