"use client";
import { useOptimistic, useTransition } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { toggleFollow } from "@/app/actions/social";

export function FollowButton({ sellerId, slug, initial, signedIn }: { sellerId: string; slug: string; initial: boolean; signedIn: boolean }) {
  const [pending, start] = useTransition();
  const [following, set] = useOptimistic(initial);
  return (
    <button type="button" aria-pressed={following} disabled={pending} className={following ? "btn-secondary" : "btn-primary"}
      onClick={() => {
        if (!signedIn) { location.href = `/auth/login?next=/s/${slug}`; return; }
        start(async () => { set(!following); await toggleFollow(sellerId, slug); });
      }}>
      {following ? <UserCheck className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
      {following ? "Following" : "Follow shop"}
    </button>
  );
}
