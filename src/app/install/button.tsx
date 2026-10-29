"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (installed) return <p className="rounded-lg bg-success/5 p-3 text-sm text-success">You&apos;re using the installed app.</p>;
  if (!evt) return <p className="text-sm text-muted">If your browser supports one-tap install, an Install button will appear here. Otherwise follow the steps below.</p>;
  return (
    <button className="btn-primary" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}>
      <Download className="size-4" aria-hidden /> Install app
    </button>
  );
}
