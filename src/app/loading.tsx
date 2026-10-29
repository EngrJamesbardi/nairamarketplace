import { GridSkeleton } from "@/components/ProductCard";

export default function Loading() {
  return (
    <div className="page" role="status" aria-label="Loading">
      <div className="mb-4 h-7 w-48 animate-pulse rounded bg-line/70" />
      <GridSkeleton />
    </div>
  );
}
