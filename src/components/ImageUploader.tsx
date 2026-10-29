"use client";
import { useRef, useState } from "react";
import { ImagePlus, X, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Img = { path: string; url: string };
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

/** Resize + re-encode on the device (saves mobile data), then upload into the user's own Storage folder. */
async function compress(file: File, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82));
  if (blob && blob.type === "image/webp") return blob;
  return (await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85))) ?? file;
}

export function ImageUploader({
  userId,
  bucket = "listing-images",
  name = "images",
  initial = [],
  max = 8,
}: {
  userId: string;
  bucket?: "listing-images" | "avatars";
  name?: string;
  initial?: Img[];
  max?: number;
}) {
  const [images, setImages] = useState<Img[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const supabase = createClient();
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, max - images.length)) {
        if (!ACCEPT.includes(file.type)) {
          setError("Only JPEG, PNG or WebP photos are allowed.");
          continue;
        }
        if (file.size > 20 * 1024 * 1024) {
          setError("That photo is too large (max 20 MB before compression).");
          continue;
        }
        const blob = await compress(file, bucket === "avatars" ? 512 : 1600);
        if (blob.size > 5 * 1024 * 1024) {
          setError("Photo is still larger than 5 MB after compression.");
          continue;
        }
        const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false });
        if (upErr) {
          setError("Upload failed. Check your connection and try again.");
          continue;
        }
        const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        setImages((prev) => [...prev, { path, url }]);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.path} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
            <input type="hidden" name={name} value={img.path} />
            {i === 0 && max > 1 && <span className="badge absolute bottom-1 left-1 bg-brand text-on-brand">Cover</span>}
            <div className="absolute right-1 top-1 flex gap-1">
              {i > 0 && (
                <button type="button" aria-label={`Move photo ${i + 1} earlier`} className="rounded-full bg-surface/90 p-1"
                  onClick={() => setImages((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <button type="button" aria-label={`Remove photo ${i + 1}`} className="rounded-full bg-surface/90 p-1"
                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}>
                <X className="size-4" />
              </button>
            </div>
          </li>
        ))}
        {images.length < max && (
          <li>
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-sm text-muted hover:border-brand hover:text-brand">
              <ImagePlus className="size-6" aria-hidden />
              {busy ? "Uploading…" : "Add photo"}
              <input ref={input} type="file" accept={ACCEPT.join(",")} multiple={max > 1} className="sr-only" disabled={busy}
                onChange={(e) => onFiles(e.target.files)} data-testid={`${name}-input`} />
            </label>
          </li>
        )}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <p className="mt-1 text-xs text-muted">Up to {max} photo{max > 1 ? "s" : ""}. JPEG, PNG or WebP. Photos are resized on your device to save data.</p>
    </div>
  );
}
