import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";

export const metadata = { title: "Account restricted" };

export default async function Suspended() {
  const { user, profile } = await getSession();
  if (!user) redirect("/auth/login");
  if (profile?.status !== "suspended" && profile?.status !== "closed") redirect("/account");
  const closed = profile.status === "closed";
  return (
    <div className="page max-w-xl space-y-4">
      <h1 className="h1">{closed ? "Your account has been closed" : "Your account is suspended"}</h1>
      <div className="card space-y-2 p-5 text-sm">
        {profile.suspended_reason && <p><span className="font-semibold">Reason:</span> {profile.suspended_reason}</p>}
        {closed ? (
          <p className="text-muted">An administrator closed this account. You can no longer sign in, and your listings and shop are hidden.</p>
        ) : (
          <>
            <p>{profile.suspended_until ? `Suspension ends ${new Date(profile.suspended_until).toLocaleString("en-GB")}.` : "This suspension has no end date."}</p>
            <p className="text-muted">While suspended you can browse but cannot post listings, message or make offers. Your listings are hidden.</p>
          </>
        )}
        <p>If you think this is a mistake, use our <Link className="link" href="/legal/complaints">complaints process</Link>.</p>
      </div>
      <form action={signOut}><button className="btn-secondary">Sign out</button></form>
    </div>
  );
}
