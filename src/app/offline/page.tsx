import { LogoMark } from "@/components/Logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="page flex flex-col items-center gap-4 py-16 text-center">
      <LogoMark size={72} />
      <h1 className="h1">You&apos;re offline</h1>
      <p className="max-w-md text-muted">
        This page hasn&apos;t been saved on your device yet. Listings you opened recently may still be available from the home
        screen, but they could be out of date.
      </p>
      <p className="max-w-md text-sm text-muted">Messaging, search, posting listings and payments need an internet connection.</p>
      <a href="/" className="btn-primary">Try again</a>
    </div>
  );
}
