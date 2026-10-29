import { changeListingStatus } from "@/app/actions/listings";

type L = { id: string; status: string; moderation_status: string };

export function ListingActions({ listing, buyers = [] }: { listing: L; buyers?: { id: string; name: string }[] }) {
  const s = listing.status;
  const btn = (action: string, label: string, cls = "btn-secondary min-h-9 px-3 text-xs") => (
    <form action={changeListingStatus}>
      <input type="hidden" name="id" value={listing.id} />
      <input type="hidden" name="action" value={action} />
      <button className={cls}>{label}</button>
    </form>
  );
  const removed = ["rejected", "removed"].includes(listing.moderation_status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {s === "draft" && btn("publish", "Publish", "btn-primary min-h-9 px-3 text-xs")}
      {s === "active" && btn("pause", "Pause")}
      {s === "active" && btn("reserve", "Mark reserved")}
      {(s === "paused" || s === "reserved") && !removed && btn("activate", "Reactivate")}
      {(s === "expired" || s === "active") && !removed && btn("renew", "Renew")}
      {["active", "reserved", "paused"].includes(s) && (
        <form action={changeListingStatus} className="flex items-center gap-1">
          <input type="hidden" name="id" value={listing.id} />
          <input type="hidden" name="action" value="sold" />
          {buyers.length > 0 && (
            <select name="buyer" aria-label="Sold to" className="input min-h-9 w-36 py-1 text-xs">
              <option value="">Sold to: not specified</option>
              {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button className="btn-secondary min-h-9 px-3 text-xs">Mark sold</button>
        </form>
      )}
      {s !== "archived" && btn("archive", "Archive")}
      {s === "archived" && btn("unarchive", "Restore")}
    </div>
  );
}
