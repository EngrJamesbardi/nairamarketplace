import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sniffImageType, MAX_IMAGE_BYTES } from "@/lib/validation";

/**
 * Verify an object the browser uploaded directly to Storage: it must be in the caller's own folder,
 * exist, be within the size limit and actually be a JPEG/PNG/WebP (magic bytes). Invalid objects are deleted.
 */
export async function verifyUploadedImage(
  supabase: SupabaseClient,
  bucket: "listing-images" | "avatars",
  path: string,
  userId: string,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/.test(path) || !path.startsWith(`${userId}/`)) {
    return { ok: false, reason: "Invalid image path" };
  }
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return { ok: false, reason: "Image upload not found" };
  if (data.size > MAX_IMAGE_BYTES) {
    await supabase.storage.from(bucket).remove([path]);
    return { ok: false, reason: "Image is larger than 5 MB" };
  }
  const head = new Uint8Array(await data.slice(0, 16).arrayBuffer());
  if (!sniffImageType(head)) {
    await supabase.storage.from(bucket).remove([path]);
    return { ok: false, reason: "File is not a JPEG, PNG or WebP image" };
  }
  return { ok: true, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}
