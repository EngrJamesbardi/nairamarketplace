"use client";
import { EmptyState } from "@/components/ProductCard";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page max-w-xl py-12">
      <EmptyState title="Something went wrong" body="Please try again. If you're offline, reconnect and retry." action={<button className="btn-primary mt-2" onClick={reset}>Try again</button>} />
    </div>
  );
}
