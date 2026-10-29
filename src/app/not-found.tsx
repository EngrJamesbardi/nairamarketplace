import Link from "next/link";
import { EmptyState } from "@/components/ProductCard";

export default function NotFound() {
  return (
    <div className="page max-w-xl py-12">
      <EmptyState title="We couldn't find that page" body="It may have been removed, sold or never existed." action={<Link href="/" className="btn-primary mt-2">Back to the market</Link>} />
    </div>
  );
}
