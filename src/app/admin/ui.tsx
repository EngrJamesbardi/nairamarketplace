export function Op({ op, back, children, className = "flex flex-wrap items-center gap-2" }: { op: string; back: string; children: React.ReactNode; className?: string }) {
  return (
    <form action="/admin/op" method="post" className={className}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="back" value={back} />
      {children}
    </form>
  );
}

export function Flash({ sp }: { sp: { ok?: string; error?: string } }) {
  if (sp.error) return <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger"><strong>Error:</strong> {sp.error}</p>;
  if (sp.ok) return <p role="status" className="rounded-lg bg-success/5 p-3 text-sm text-success">Saved. The change was recorded in the audit log.</p>;
  return null;
}

export const small = "btn-secondary min-h-9 px-3 text-xs";
export const smallPrimary = "btn-primary min-h-9 px-3 text-xs";
export const smallDanger = "btn-danger min-h-9 px-3 text-xs";
