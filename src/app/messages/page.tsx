import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EmptyState } from "@/components/ProductCard";

export const metadata = { title: "Messages" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const { box } = await searchParams;
  const { supabase, user } = await requireUser("/messages");
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("last_read_at, archived_at, role, conversation:conversations(id, last_message_at, last_message_preview, buyer_id, seller_id, listing:listings(id, title, images:listing_images(url, position)), buyer:profiles!conversations_buyer_id_fkey(display_name), seller:seller_profiles!conversations_seller_shop_fkey(shop_name))")
    .eq("user_id", user.id)
    .limit(200);
  const rows = (parts ?? [])
    .filter((p) => p.conversation && (box === "archived" ? p.archived_at : !p.archived_at))
    .sort((a, b) => +new Date(b.conversation!.last_message_at) - +new Date(a.conversation!.last_message_at));

  return (
    <div className="page max-w-3xl">
      <h1 className="h1 mb-3">Messages</h1>
      <nav className="mb-4 flex gap-2" aria-label="Mailbox">
        <Link href="/messages" className={`chip ${box !== "archived" ? "chip-active" : ""}`}>Inbox</Link>
        <Link href="/messages?box=archived" className={`chip ${box === "archived" ? "chip-active" : ""}`}>Archived</Link>
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No conversations yet" body="When you message a seller or a buyer messages you, it will appear here." action={<Link href="/" className="btn-primary mt-2">Browse listings</Link>} />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {rows.map((p) => {
            const c = p.conversation!;
            const unread = !p.last_read_at || new Date(c.last_message_at) > new Date(p.last_read_at);
            const other = p.role === "buyer" ? c.seller?.shop_name ?? "Seller" : c.buyer?.display_name ?? "Buyer";
            const img = c.listing ? [...c.listing.images].sort((a, b) => a.position - b.position)[0]?.url : null;
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-cream/50" data-testid="conversation">
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-canvas">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img && <img src={img} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`flex justify-between gap-2 text-sm ${unread ? "font-bold" : "font-medium"}`}>
                      <span className="truncate">{other}</span>
                      <time className="shrink-0 text-xs font-normal text-muted">{new Date(c.last_message_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</time>
                    </p>
                    <p className="truncate text-xs text-muted">{c.listing?.title ?? "Listing removed"}</p>
                    <p className={`truncate text-sm ${unread ? "text-ink" : "text-muted"}`}>{c.last_message_preview}</p>
                  </div>
                  {unread && <span className="size-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
