/**
 * Client-side image compression for KYC uploads (mobile camera photos).
 * PDFs and non-images are returned unchanged.
 */

const MAX_EDGE = 1920;
const JPEG_QUALITY = 0.82;
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024;

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Compress an image File via canvas. Returns original on failure / PDF / small files.
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!file || file.size === 0) return file;
  if (isPdf(file)) return file;
  if (!isImageFile(file)) return file;
  // Already small enough
  if (file.size <= TARGET_MAX_BYTES && file.type === "image/jpeg") return file;

  // HEIC often cannot be decoded in canvas on all browsers — try; fall back to original
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size === 0) return file;
    // If compression made it larger, keep original (unless original is HEIC-ish and unreadable server-side)
    if (blob.size >= file.size && file.type.startsWith("image/")) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "document";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

/** Compress all image entries in FormData file fields in place. */
export async function compressKycFormData(
  formData: FormData,
  fields: readonly string[] = ["docFront", "docBack", "docSelfie"],
): Promise<FormData> {
  const out = new FormData();
  for (const [key, value] of formData.entries()) {
    if (
      fields.includes(key) &&
      typeof value === "object" &&
      value !== null &&
      "arrayBuffer" in value
    ) {
      const file = value as File;
      if (file.size > 0) {
        const compressed = await compressImageFile(file);
        out.append(key, compressed, compressed.name);
      }
    } else {
      out.append(key, value);
    }
  }
  return out;
}
