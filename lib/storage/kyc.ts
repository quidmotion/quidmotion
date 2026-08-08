import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";

export const KYC_BUCKET = "kyc-documents";

let _supabase: SupabaseClient | null = null;

function nowIso() {
  return new Date().toISOString();
}

/** True when Supabase Storage credentials are present (or KYC_STORAGE=supabase). */
export function useSupabaseKycStorage(): boolean {
  const override = process.env.KYC_STORAGE?.toLowerCase();
  if (override === "local") return false;
  if (override === "supabase") return true;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function getSupabaseAdmin(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new AppError(
      "CONFIG",
      "Supabase Storage is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
      500,
    );
  }
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

export function getLocalUploadsRoot() {
  return path.join(process.cwd(), "data", "uploads", "kyc");
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/** Normalize to storage key: kyc/{userId}/{file} */
export function normalizeKycObjectKey(relativePath: string): string {
  const cleaned = relativePath
    .replace(/^[/\\]+/, "")
    .replace(/\.\./g, "")
    .replace(/\\/g, "/");
  if (cleaned.startsWith("kyc/")) return cleaned;
  return `kyc/${cleaned}`;
}

/**
 * Persist a KYC file. Returns relative object key `kyc/{userId}/{stored}`.
 * Uses Supabase Storage when configured; otherwise local disk (dev).
 */
export async function saveKycObject(
  userId: string,
  filename: string,
  data: Buffer,
  contentType?: string,
): Promise<string> {
  const safeName = sanitizeFilename(filename);
  const stored = `${Date.now()}_${safeName}`;
  const objectKey = `kyc/${userId}/${stored}`;

  if (useSupabaseKycStorage()) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(KYC_BUCKET)
      .upload(objectKey, data, {
        contentType: contentType || guessContentType(safeName),
        upsert: false,
      });
    if (error) {
      // Common first-deploy miss: bucket not created yet
      console.error("[kyc-storage] upload failed", error.message);
      throw new AppError(
        "STORAGE",
        `KYC upload failed: ${error.message}. Ensure the "${KYC_BUCKET}" bucket exists in Supabase Storage.`,
        500,
      );
    }
    return objectKey;
  }

  // Local filesystem (development only — not writable on Vercel)
  const dir = path.join(getLocalUploadsRoot(), userId);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, stored), data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Disk write failed";
    console.error("[kyc-storage] local write failed", msg);
    throw new AppError(
      "STORAGE",
      `KYC upload failed (${msg}). On Vercel, set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and create the ${KYC_BUCKET} bucket.`,
      500,
    );
  }
  return objectKey;
}

export type KycObjectPayload = {
  data: Buffer;
  contentType: string;
};

/** Load a KYC object for authorized serving. */
export async function loadKycObject(
  relativePath: string,
): Promise<KycObjectPayload | null> {
  const objectKey = normalizeKycObjectKey(relativePath);

  if (useSupabaseKycStorage()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(KYC_BUCKET)
      .download(objectKey);
    if (error || !data) {
      // Fall through to local for mixed-history keys during migration
      const local = readLocalKycObject(objectKey);
      if (local) return local;
      console.warn("[kyc-storage] download miss", objectKey, error?.message);
      return null;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    return {
      data: buf,
      contentType: data.type || guessContentType(objectKey),
    };
  }

  return readLocalKycObject(objectKey);
}

function readLocalKycObject(objectKey: string): KycObjectPayload | null {
  const cleaned = objectKey.replace(/^kyc\//, "");
  const full = path.join(process.cwd(), "data", "uploads", "kyc", cleaned);
  const root = path.join(process.cwd(), "data", "uploads");
  if (!full.startsWith(root)) return null;
  if (!fs.existsSync(full)) return null;
  return {
    data: fs.readFileSync(full),
    contentType: guessContentType(full),
  };
}

export function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
  };
  return types[ext] ?? "application/octet-stream";
}

/** Ensure private bucket exists (best-effort; ignore if already present). */
export async function ensureKycBucket(): Promise<void> {
  if (!useSupabaseKycStorage()) return;
  const supabase = getSupabaseAdmin();
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.warn("[kyc-storage] listBuckets", listErr.message);
    return;
  }
  if (buckets?.some((b) => b.id === KYC_BUCKET || b.name === KYC_BUCKET)) {
    return;
  }
  const { error } = await supabase.storage.createBucket(KYC_BUCKET, {
    public: false,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
      "application/pdf",
    ],
  });
  if (error) {
    console.warn("[kyc-storage] createBucket", error.message, nowIso());
  }
}
