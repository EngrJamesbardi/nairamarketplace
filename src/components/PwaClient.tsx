"use client";
import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";

/** Registers the service worker, shows offline/cached-copy banners and a safe "update available" prompt. */
export function PwaClient() {
  const [offline, setOffline] = useState(false);
  const [cachedCopy, setCachedCopy] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    setOffline(!navigator.onLine);
    setCachedCopy(document.body.dataset.offlineCache === "true");
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
      });
      // Reload only after the user accepted an update — never on first install (that would wipe half-filled forms).
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!reloaded && sessionStorage.getItem("nm_sw_update") === "1") {
          sessionStorage.removeItem("nm_sw_update");
          reloaded = true;
          location.reload();
        }
      });
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <div aria-live="polite">
      {(offline || cachedCopy) && (
        <div role="status" className="flex items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-sm text-white" data-testid="offline-banner">
          <WifiOff className="size-4" aria-hidden />
          {cachedCopy
            ? "You're viewing a saved copy. Prices and availability may be out of date."
            : "You're offline. Saved pages may be out of date; messaging, search and posting need a connection."}
        </div>
      )}
      {waiting && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-cream px-4 py-2 text-sm text-ink">
          A new version of Naira Marketplace is ready.
          <button className="btn-primary min-h-9" onClick={() => {
              try { sessionStorage.setItem("nm_sw_update", "1"); } catch {}
              waiting.postMessage("SKIP_WAITING");
            }}>
            <RefreshCw className="size-4" aria-hidden /> Update now
          </button>
        </div>
      )}
    </div>
  );
}
