"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, MoreVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, respondOffer, markRead } from "@/app/actions/messages";
import { toggleBlock } from "@/app/actions/social";
import { archiveConversation } from "@/app/actions/conversations";
import { FormMessage, SubmitButton } from "@/components/FormStatus";

/** Live chat: subscribe to new messages/offers in this conversation (RLS applies to Realtime). */
export function LiveUpdates({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      // Realtime needs the user's JWT so Row Level Security can authorise each change event.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
      .channel(`conv:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => {
        router.refresh();
        markRead(conversationId).catch(() => {});
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "offers", filter: `conversation_id=eq.${conversationId}` }, () => router.refresh())
      .subscribe((status) => {
        document.documentElement.dataset.live = status;
        if (status !== "SUBSCRIBED") console.warn("Live chat updates unavailable (falling back to polling):", status);
      });
    })();
    // Fallback polling in case Realtime is unavailable on the network.
    const poll = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 20000);
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); clearInterval(poll); };
  }, [conversationId, router]);
  // Bring the latest message and the composer into view (not the page footer below them).
  useEffect(() => { document.getElementById("chat-end")?.scrollIntoView({ block: "end" }); }, []);
  return null;
}

export function MarkRead({ conversationId }: { conversationId: string }) {
  useEffect(() => { markRead(conversationId).catch(() => {}); }, [conversationId]);
  return null;
}

export function Composer({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendMessage, null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => { if (state?.ok) { form.current?.reset(); router.refresh(); } }, [state, router]);
  return (
    <form ref={form} id="composer" action={action} className="sticky bottom-16 z-10 space-y-2 bg-canvas pb-2 md:bottom-0">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex items-end gap-2">
        <label htmlFor="body" className="sr-only">Message</label>
        <textarea id="body" name="body" rows={1} maxLength={2000} required placeholder="Write a message…" className="input min-h-11 flex-1 resize-y" />
        <SubmitButton className="btn-primary size-11 shrink-0 p-0" pendingText="…" aria-label="Send"><Send className="size-5" aria-hidden /></SubmitButton>
      </div>
      <FormMessage state={state?.error ? state : null} />
    </form>
  );
}

export function OfferActions({ offer, conversationId }: { offer: { id: string; amount: string; currency: string; mine: boolean; expiresAt: string }; conversationId: string }) {
  const [state, action] = useActionState(respondOffer, null);
  const [counter, setCounter] = useState(false);
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <div className="card space-y-2 border-amber p-3" data-testid="offer-actions">
      <p className="text-sm">
        {offer.mine ? <>Your offer of <strong>{offer.amount}</strong> is waiting for a reply.</> : <>Offer of <strong>{offer.amount}</strong> is waiting for your reply.</>}
        <span className="block text-xs text-muted">Expires {new Date(offer.expiresAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      </p>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="offerId" value={offer.id} />
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="currency" value={offer.currency} />
        {offer.mine ? (
          <SubmitButton name="action" value="withdraw" className="btn-secondary">Withdraw offer</SubmitButton>
        ) : counter ? (
          <>
            <div>
              <label htmlFor={`counter-${offer.id}`} className="label">Counter-offer ({offer.currency})</label>
              <input id={`counter-${offer.id}`} name="amount" inputMode="decimal" required className="input w-40" />
            </div>
            <SubmitButton name="action" value="counter">Send counter-offer</SubmitButton>
            <button type="button" className="btn-ghost" onClick={() => setCounter(false)}>Cancel</button>
          </>
        ) : (
          <>
            <SubmitButton name="action" value="accept">Accept</SubmitButton>
            <button type="button" className="btn-secondary" onClick={() => setCounter(true)}>Counter</button>
            <SubmitButton name="action" value="reject" className="btn-secondary">Decline</SubmitButton>
          </>
        )}
      </form>
      <FormMessage state={state?.error ? state : null} />
    </div>
  );
}

export function ConversationMenu({ otherId, blocked, conversationId }: { otherId: string; blocked: boolean; conversationId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <details className="relative">
      <summary className="btn-ghost list-none px-2" aria-label="Conversation options"><MoreVertical className="size-5" aria-hidden /></summary>
      <div className="card absolute right-0 z-20 mt-1 w-48 p-1 shadow-lg">
        <button disabled={pending} className="btn-ghost w-full justify-start" onClick={() => start(async () => { await archiveConversation(conversationId); router.push("/messages"); })}>Archive</button>
        <button disabled={pending} className="btn-ghost w-full justify-start text-danger" onClick={() => start(async () => { await toggleBlock(otherId, `/messages/${conversationId}`); router.refresh(); })}>
          {blocked ? "Unblock member" : "Block member"}
        </button>
      </div>
    </details>
  );
}
