import { InstallButton } from "./button";
import { LogoMark } from "@/components/Logo";

export const metadata = { title: "Install the app", description: "Add Naira Marketplace to your home screen. No app store needed." };

export default function InstallPage() {
  return (
    <div className="page max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <LogoMark size={56} />
        <div>
          <h1 className="h1">Install Naira Marketplace</h1>
          <p className="text-muted">Add it to your home screen like an app. No app store, small download.</p>
        </div>
      </div>
      <InstallButton />
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="h2">Android (Chrome, Edge, Samsung Internet)</h2>
        <p>Tap <strong>Install</strong> above, or open the browser menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
      </section>
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="h2">iPhone and iPad (Safari)</h2>
        <p>Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>. Other iOS browsers may not offer this option; use Safari.</p>
      </section>
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="h2">Desktop (Chrome, Edge)</h2>
        <p>Click the install icon in the address bar, or use the browser menu and choose <strong>Install Naira Marketplace</strong>.</p>
      </section>
      <section className="space-y-1 text-sm text-muted">
        <h2 className="font-semibold text-ink">What works offline?</h2>
        <p>The app shell and pages you have recently opened (such as listings) can be viewed offline, marked as possibly out of date. Messaging, search, posting and payments need a connection.</p>
        <p>Firefox on desktop does not support installing web apps. Push notifications are not enabled yet; you will see new messages and offers in the app.</p>
      </section>
    </div>
  );
}
