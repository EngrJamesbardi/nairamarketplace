"use client";
import { useRef, useState } from "react";
import { ImagePlus, X, ArrowLeft, ArrowRight, Star, RefreshCw } from "lucide-react";
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

/**
 * Photo picker for listings (and single logos). The first photo is the cover. Sellers can preview, reorder, make any
 * photo the cover, replace or remove photos before saving; the order of the hidden inputs is the order saved.
 * Photos uploaded in this session and then removed or replaced are deleted from Storage straight away; photos that
 * were already saved are only removed when the listing is saved (the server owns that).
 */
export function ImageUploader({
  userId,
  bucket = "listing-images",
  name = "images",
  initial = [],
  max = 10,
  min = 0,
}: {
  userId: string;
  bucket?: "listing-images" | "avatars";
  name?: string;
  initial?: Img[];
  max?: number;
  /** Photos needed to publish (shown as guidance; the server enforces it). */
  min?: number;
}) {
  const [images, setImages] = useState<Img[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceIndex = useRef<number | null>(null);
  const saved = useRef(new Set(initial.map((i) => i.path)));

  async function upload(file: File): Promise<Img | null> {
    if (!ACCEPT.includes(file.type)) {
      setError("Only JPEG, PNG or WebP photos are allowed.");
      return null;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("That photo is too large (max 20 MB before compression).");
      return null;
    }
    const blob = await compress(file, bucket === "avatars" ? 512 : 1600);
    if (blob.size > 5 * 1024 * 1024) {
      setError("Photo is still larger than 5 MB after compression.");
      return null;
    }
    const supabase = createClient();
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false });
    if (upErr) {
      setError("Upload failed. Check your connection and try again.");
      return null;
    }
    return { path, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
  }

  /** Unsaved uploads that are dropped are deleted now, so abandoned photos don't pile up in Storage. */
  function discard(img: Img) {
    if (!saved.current.has(img.path)) createClient().storage.from(bucket).remove([img.path]).catch(() => {});
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = max - images.length;
    if (files.length > room) setError(`You can add ${room} more photo${room === 1 ? "" : "s"} (maximum ${max}).`);
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const img = await upload(file);
        if (img) setImages((prev) => (prev.length < max ? [...prev, img] : prev));
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function onReplace(files: FileList | null) {
    const i = replaceIndex.current;
    replaceIndex.current = null;
    if (!files?.length || i === null) return;
    setError(null);
    setBusy(true);
    try {
      const img = await upload(files[0]);
      if (img) {
        setImages((prev) => {
          const n = [...prev];
          if (n[i]) discard(n[i]);
          n[i] = img;
          return n;
        });
        setAnnounce(`Photo ${i + 1} replaced`);
      }
    } finally {
      setBusy(false);
      if (replaceInput.current) replaceInput.current.value = "";
    }
  }

  function move(from: number, to: number) {
    setImages((p) => {
      if (to < 0 || to >= p.length) return p;
      const n = [...p];
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x);
      return n;
    });
    setAnnounce(to === 0 ? `Photo ${from + 1} is now the cover photo` : `Photo moved to position ${to + 1}`);
  }

  function remove(i: number) {
    setImages((p) => {
      if (p[i]) discard(p[i]);
      return p.filter((_, j) => j !== i);
    });
    setAnnounce(`Photo ${i + 1} removed`);
  }

  const multi = max > 1;
  const btn = "flex size-8 items-center justify-center rounded-full bg-surface/95 text-ink shadow-sm hover:text-brand disabled:opacity-40";
  return (
    <div>
      <ul className={`grid gap-2 ${multi ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "w-32 grid-cols-1"}`} data-testid={`${name}-list`}>
        {images.map((img, i) => (
          <li key={img.path} className={`relative overflow-hidden rounded-xl border bg-canvas ${i === 0 && multi ? "border-brand ring-2 ring-brand/40" : "border-line"}`} data-testid={`${name}-item`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={`Photo ${i + 1}${i === 0 && multi ? " (cover)" : ""}`} className="aspect-square w-full object-cover" />
            <input type="hidden" name={name} value={img.path} />
            {i === 0 && multi && <span className="badge absolute left-1 top-1 bg-brand text-on-brand">Cover</span>}
            <button type="button" aria-label={`Remove photo ${i + 1}`} title="Remove" className={`${btn} absolute right-1 top-1`} onClick={() => remove(i)} disabled={busy}>
              <X className="size-4" aria-hidden />
            </button>
            <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
              {multi && (
                <button type="button" aria-label={`Move photo ${i + 1} earlier`} title="Move earlier" className={btn} onClick={() => move(i, i - 1)} disabled={i === 0 || busy}>
                  <ArrowLeft className="size-4" aria-hidden />
                </button>
              )}
              {multi && i > 0 && (
                <button type="button" aria-label={`Make photo ${i + 1} the cover`} title="Make cover" className={btn} onClick={() => move(i, 0)} disabled={busy}>
                  <Star className="size-4" aria-hidden />
                </button>
              )}
              <button type="button" aria-label={`Replace photo ${i + 1}`} title="Replace" className={btn} disabled={busy}
                onClick={() => { replaceIndex.current = i; replaceInput.current?.click(); }}>
                <RefreshCw className="size-4" aria-hidden />
              </button>
              {multi && (
                <button type="button" aria-label={`Move photo ${i + 1} later`} title="Move later" className={btn} onClick={() => move(i, i + 1)} disabled={i === images.length - 1 || busy}>
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
        {images.length < max && (
          <li>
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line p-2 text-center text-sm text-muted hover:border-brand hover:text-brand">
              <ImagePlus className="size-6" aria-hidden />
              {busy ? "Uploading…" : images.length === 0 ? (multi ? "Add photos" : "Add photo") : "Add more"}
              <input ref={input} type="file" accept={ACCEPT.join(",")} multiple={multi} className="sr-only" disabled={busy}
                onChange={(e) => onFiles(e.target.files)} data-testid={`${name}-input`} />
            </label>
          </li>
        )}
      </ul>
      <input ref={replaceInput} type="file" accept={ACCEPT.join(",")} className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => onReplace(e.target.files)} data-testid={`${name}-replace-input`} />
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      {multi ? (
        <p className="mt-2 text-xs text-muted" data-testid={`${name}-count`}>
          <strong className={min && images.length < min ? "text-warning" : "text-ink"}>{images.length} of {max} photos</strong>
          {min > 0 && images.length < min && <> · add at least {min - images.length} more to publish ({min} needed for this category)</>}
          {" "}· The first photo is the cover: use ★ to change it and the arrows to reorder. JPEG, PNG or WebP, resized on your device to save data.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">JPEG, PNG or WebP. Resized on your device to save data.</p>
      )}
    </div>
  );
}
