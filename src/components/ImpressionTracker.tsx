"use client";
import { useEffect } from "react";

/**
 * Reports sponsored cards that were genuinely seen: at least half visible for one second.
 * Watches the DOM so cards added by client-side navigation are picked up too.
 */
export function ImpressionTracker() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const seen = new Set<string>();
    const timers = new Map<Element, number>();
    const queue: string[] = [];
    let flushTimer: number | undefined;
    const flush = () => {
      if (!queue.length) return;
      const ids = queue.splice(0, 6);
      fetch("/api/promotions/impression", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), keepalive: true }).catch(() => {});
      if (queue.length) flush();
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.campaign;
          if (!id || seen.has(id)) continue;
          if (e.isIntersecting) {
            timers.set(e.target, window.setTimeout(() => {
              seen.add(id);
              io.unobserve(e.target);
              queue.push(id);
              clearTimeout(flushTimer);
              flushTimer = window.setTimeout(flush, 300);
            }, 1000));
          } else {
            clearTimeout(timers.get(e.target));
          }
        }
      },
      { threshold: 0.5 },
    );
    const scan = () => document.querySelectorAll<HTMLElement>("[data-campaign]").forEach((el) => !seen.has(el.dataset.campaign!) && io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("pagehide", flush);
    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("pagehide", flush);
      clearTimeout(flushTimer);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);
  return null;
}
