/** Optional seller-configured WhatsApp contact. Never required to use the marketplace. */
export function WhatsAppLink({ number, text }: { number: string; text: string }) {
  const digits = number.replace(/[^\d]/g, "");
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="btn-secondary w-full"
    >
      Chat on WhatsApp
      <span className="sr-only"> (opens WhatsApp, outside Naira Marketplace)</span>
    </a>
  );
}
