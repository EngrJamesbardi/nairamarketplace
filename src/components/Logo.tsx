import Link from "next/link";

export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className={className}>
      <rect width="512" height="512" rx="112" fill="var(--brand)" />
      <path
        d="M96 112h320v52a32 32 0 0 1-64 0 32 32 0 0 1-64 0 32 32 0 0 1-64 0 32 32 0 0 1-64 0 32 32 0 0 1-64 0z"
        fill="#FFF0E7"
      />
      <path d="M168 404V246l176 158V246" fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M312 270l32-36 32 36" fill="none" stroke="#E5A16D" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-lg" aria-label="Naira Marketplace home">
      <LogoMark />
      {!compact && (
        <span className="leading-none">
          <span className="block text-lg font-extrabold tracking-tight text-ink">Naira</span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Marketplace</span>
        </span>
      )}
    </Link>
  );
}
