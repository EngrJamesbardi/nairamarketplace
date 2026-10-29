import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert, Info } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PriceTag } from "@/components/ProductCard";
import { formatMoney } from "@/lib/money";
import { t } from "@/i18n";
import { Composer, LiveUpdates, OfferActions, ConversationMenu, MarkRead } from "./client";
import { ReportForm } from "@/app/listing/[id]/client";
import { ReviewForm } from "./review";

export const metadata = { title: "Conversation" };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber/20 text-sponsored-fg",
  accepted: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
  countered: "bg-canvas text-muted",
  withdrawn: "bg-canvas text-muted",
  expired: "bg-canvas text-muted",
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/messages/${id}`);
  const { data: conv } = await supabase
    .from("conversations")
    .select("*, listing:listings(id, title, price_minor, currency, price_type, country_code, status, sold_to, seller_id), buyer:profiles!conversations_buyer_id_fkey(display_name), seller:seller_profiles!conversations_seller_shop_fkey(shop_name, slug)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) notFound(); // RLS: non-participants get nothing
  const [{ data: messages }, { data: offers }, { data: blocked }, { data: eligibility }] = await Promise.all([
    supabase.from("messages").select("*").eq("conversation_id", id).order("created_at").limit(500),
    supabase.from("offers").select("*").eq("conversation_id", id).order("created_at"),
    supabase.from("blocked_users").select("blocked_id").eq("blocker_id", user.id).in("blocked_id", [conv.buyer_id, conv.seller_id]),
    conv.listing && user.id === conv.buyer_id ? supabase.rpc("review_eligibility", { p_listing: conv.listing.id, p_user: user.id }) : Promise.resolve({ data: null }),
  ]);
  const isBuyer = user.id === conv.buyer_id;
  const otherId = isBuyer ? conv.seller_id : conv.buyer_id;
  const otherName = isBuyer ? conv.seller?.shop_name ?? "Seller" : conv.buyer?.display_name ?? "Buyer";
  const offerById = new Map((offers ?? []).map((o) => [o.id, o]));
  const iBlocked = (blocked ?? []).length > 0;
  const { data: existingReview } = conv.listing && isBuyer ? await supabase.from("reviews").select("rating, body").eq("listing_id", conv.listing.id).eq("reviewer_id", user.id).maybeSingle() : { data: null };
  const locale = `en-${conv.listing?.country_code ?? "NG"}`;

  return (
    <div className="page max-w-3xl space-y-3">
      <MarkRead conversationId={id} />
      <LiveUpdates conversationId={id} />
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{otherName}</p>
          {conv.listing ? (
            <Link href={`/listing/${conv.listing.id}`} className="block truncate text-sm text-muted hover:text-brand">
              {conv.listing.title} · <PriceTag priceMinor={conv.listing.price_minor} currency={conv.listing.currency} priceType={conv.listing.price_type} country={conv.listing.country_code} className="font-semibold" />
              {conv.listing.status !== "active" && ` · ${t(`status.${conv.listing.status}`)}`}
            </Link>
          ) : <p className="text-sm text-muted">Listing no longer available</p>}
        </div>
        <ConversationMenu otherId={otherId} blocked={iBlocked} conversationId={id} />
      </div>

      <p className="flex gap-2 rounded-xl bg-cream p-3 text-xs">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        Agree payment and delivery directly. Never share passwords or card PINs, and be careful with links. An accepted offer is an agreed price, not a payment.
      </p>

      <ol className="space-y-2" aria-label="Messages" data-testid="message-list">
        {(messages ?? []).map((m) => {
          const mine = m.sender_id === user.id;
          const offer = m.offer_id ? offerById.get(m.offer_id) : null;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-brand text-on-brand" : "rounded-bl-sm border border-line bg-surface"}`}>
                {offer && (
                  <div className={`mb-1 rounded-lg p-2 ${mine ? "bg-black/15" : "bg-cream"}`} data-testid="offer-card">
                    <p className="text-xs uppercase tracking-wide opacity-80">{offer.parent_offer_id ? "Counter-offer" : "Offer"}</p>
                    <p className="text-lg font-bold">{formatMoney(offer.amount_minor, offer.currency, locale)}{offer.quantity > 1 && <span className="text-sm font-normal"> × {offer.quantity}</span>}</p>
                    <span className={`badge ${STATUS_STYLE[offer.status]}`} data-testid="offer-status">{offer.status}</span>
                    {offer.note && <p className="mt-1 text-xs">{offer.note}</p>}
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                {m.has_link && !mine && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning"><ShieldAlert className="size-3.5" aria-hidden />Contains a link. Don&apos;t enter passwords or pay through unknown links.</p>
                )}
                <p className={`mt-0.5 text-[11px] ${mine ? "text-on-brand/80" : "text-muted"}`}>
                  <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                </p>
                {!mine && m.kind === "text" && m.sender_id && <div className="text-ink"><ReportForm targetType="message" messageId={m.id} label="Report" /></div>}
              </div>
            </li>
          );
        })}
      </ol>

      {(offers ?? []).filter((o) => o.status === "pending" && new Date(o.expires_at) > new Date()).map((o) => (
        <OfferActions key={o.id} offer={{ id: o.id, amount: formatMoney(o.amount_minor, o.currency, locale), currency: o.currency, mine: o.proposed_by === user.id, expiresAt: o.expires_at }} conversationId={id} />
      ))}

      {isBuyer && conv.listing && eligibility && eligibility !== "ineligible" && (
        <ReviewForm listingId={conv.listing.id} sellerName={otherName} verified={eligibility === "verified"} existing={existingReview} />
      )}

      {iBlocked ? (
        <p className="card p-3 text-sm text-muted">You blocked this member. Unblock them to send messages.</p>
      ) : (
        <Composer conversationId={id} />
      )}
    </div>
  );
}
