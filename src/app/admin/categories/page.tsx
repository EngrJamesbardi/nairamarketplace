import { requireAdminOnly } from "@/lib/auth";
import { Op, Flash, smallPrimary } from "../ui";

export default async function Categories({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdminOnly();
  const { data: cats } = await supabase.from("categories").select("*").order("sort_order");
  const top = (cats ?? []).filter((c) => !c.parent_id);
  const Row = ({ c }: { c?: NonNullable<typeof cats>[number] }) => (
    <Op op="category.upsert" back="/admin/categories" className="grid items-end gap-2 sm:grid-cols-7">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className="text-xs sm:col-span-2">Name<input name="name" required defaultValue={c?.name} className="input min-h-9 py-1" /></label>
      <label className="text-xs">Slug<input name="slug" required defaultValue={c?.slug} className="input min-h-9 py-1" /></label>
      <label className="text-xs">Parent
        <select name="parent" defaultValue={c?.parent_id ?? ""} className="input min-h-9 py-1"><option value="">—</option>{top.filter((t) => t.id !== c?.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </label>
      <label className="text-xs">Sort<input name="sort" type="number" defaultValue={c?.sort_order ?? 0} className="input min-h-9 py-1" /></label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={c?.is_active ?? true} className="size-4 accent-[var(--brand)]" /> Active</label>
      <input type="hidden" name="icon" value={c?.icon ?? ""} />
      <button className={smallPrimary}>{c ? "Save" : "Add category"}</button>
    </Op>
  );
  return (
    <>
      <h1 className="h1">Categories</h1>
      <Flash sp={sp} />
      <p className="text-sm text-muted">
        &ldquo;Photos needed to publish&rdquo; applies to the category and its subcategories (maximum 10 photos per listing). The default is 4; food,
        books and beauty start at 2 because four distinct photos of a bag of rice or a paperback rarely help buyers. Existing live listings are
        never unpublished by a change here.
      </p>
      <section className="card p-4"><h2 className="mb-2 font-semibold">New category</h2><Row /></section>
      <ul className="space-y-2">
        {(cats ?? []).sort((a, b) => (a.parent_id ?? a.id) - (b.parent_id ?? b.id) || (a.parent_id ? 1 : -1)).map((c) => (
          <li key={c.id} className={`card space-y-2 p-3 ${c.parent_id ? "ml-6" : ""}`}>
            <Row c={c} />
            {!c.parent_id && (
              <Op op="category.min_images" back="/admin/categories">
                <input type="hidden" name="id" value={c.id} />
                <label className="flex items-center gap-2 text-xs">Photos needed to publish
                  <input name="min_images" type="number" min={1} max={10} defaultValue={c.min_images} className="input min-h-9 w-20 py-1" />
                </label>
                <button className={smallPrimary}>Save</button>
              </Op>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
