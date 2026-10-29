"use client";
import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { toggleFavourite } from "@/app/actions/social";

export function FavouriteButton({ listingId, initial }: { listingId: string; initial: boolean }) {
  const [pending, start] = useTransition();
  const [fav, setFav] = useState(initial);
  return (
    <button
      type="button"
      aria-pressed={fav}
      aria-label={fav ? "Remove from saved" : "Save listing"}
      disabled={pending}
      onClick={() => {
        const next = !fav;
        setFav(next); // optimistic
        start(async () => {
          const res = await toggleFavourite(listingId);
          if (res?.redirect) window.location.href = res.redirect;
          else if (typeof res?.favourited === "boolean") setFav(res.favourited);
          else setFav(!next); // failed: roll back
        });
      }}
      className="inline-flex size-9 items-center justify-center rounded-full bg-surface/95 text-ink shadow-sm hover:text-brand"
    >
      <Heart className={`size-5 ${fav ? "fill-brand text-brand" : ""}`} aria-hidden />
    </button>
  );
}
