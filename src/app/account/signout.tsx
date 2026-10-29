"use client";
/** Clears device-cached pages before signing out so the next person on a shared phone sees nothing personal. */
export function SignOutButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="btn-secondary"
      onClick={() => {
        navigator.serviceWorker?.controller?.postMessage("CLEAR_PRIVATE");
      }}
    >
      {children}
    </button>
  );
}
