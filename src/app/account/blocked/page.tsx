import { requireUser } from "@/lib/auth";
import { EmptyState } from "@/components/ProductCard";
import { toggleBlock } from "@/app/actions/social";

export const metadata = { title: "Blocked members" };

export default async function Blocked() {
  const { supabase, user } = await requireUser("/account/blocked");
  const { data } = await supabase.from("blocked_users").select("blocked_id, created_at, member:profiles!blocked_users_blocked_id_fkey(display_name)").eq("blocker_id", user.id);
  async function unblock(formData: FormData) {
    "use server";
    await toggleBlock(String(formData.get("id")), "/account/blocked");
  }
  return (
    <div className="page max-w-2xl">
      <h1 className="h1 mb-4">Blocked members</h1>
      {!data?.length ? <EmptyState title="You haven't blocked anyone" body="Blocked members can't message you or make offers on your listings." /> : (
        <ul className="card divide-y divide-line">
          {data.map((b) => (
            <li key={b.blocked_id} className="flex items-center justify-between p-3">
              <span>{b.member?.display_name}</span>
              <form action={unblock}><input type="hidden" name="id" value={b.blocked_id} /><button className="btn-secondary min-h-9">Unblock</button></form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
