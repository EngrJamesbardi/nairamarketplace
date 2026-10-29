"use client";
import { useState, useTransition } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { toggleFollow } from "@/app/actions/social";

export function FollowButton({ sellerId, slug, initial, signedIn }: { sellerId: string; slug: string; initial: boolean; signedIn: boolean }) {
  const [pending, start] = useTransition();
  const [following, set] = useState(initial);
  return (
    <button type="button" aria-pressed={following} disabled={pending} className={following ? "btn-secondary" : "btn-primary"}
      onClick={() => {
        if (!signedIn) { location.href = `/auth/login?next=/s/${slug}`; return; }
        set(!following);
        start(async () => { const r = await toggleFollow(sellerId, slug); if (typeof r.following === "boolean") set(r.following); });
      }}>
      {following ? <UserCheck className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
      {following ? "Following" : "Follow shop"}
    </button>
  );
}
