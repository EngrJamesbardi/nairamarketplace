import { LogoMark } from "@/components/Logo";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-center bg-cream px-4 py-10">
      <div className="card w-full max-w-md space-y-5 p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <LogoMark size={48} />
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
