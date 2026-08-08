import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { kycSubmissions, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  ensureKycBucket,
  getLocalUploadsRoot,
  loadKycObject,
  saveKycObject,
} from "@/lib/storage/kyc";
import {
  assertActive,
  assertAdmin,
  assertSelfOrAdmin,
  loadActor,
} from "./_authz";
import { notifyKycStatus } from "./email";
import { logEvent } from "./audit";

export type KycSubmitInput = {
  fullLegalName: string;
  dateOfBirth: string;
  country: string;
  documentType: string;
  documentNumber: string;
  /** Storage object keys (kyc/{userId}/…) already saved by the action layer */
  documentPaths: string[];
};

function nowIso() {
  return new Date().toISOString();
}

export function getUploadsRoot() {
  return getLocalUploadsRoot();
}

/**
 * Persist an uploaded file for a user.
 * Uses Supabase Storage when configured (required on Vercel); local disk otherwise.
 * Returns object key `kyc/{userId}/{file}`.
 */
export async function saveKycFile(
  userId: string,
  filename: string,
  data: Buffer,
  contentType?: string,
): Promise<string> {
  await ensureKycBucket();
  return saveKycObject(userId, filename, data, contentType);
}

/** @deprecated Prefer loadKycDocument — kept for callers that only need a local path. */
export function resolveUploadPath(relativePath: string): string | null {
  const cleaned = relativePath.replace(/^[/\\]+/, "").replace(/\.\./g, "");
  const full = path.join(process.cwd(), "data", "uploads", cleaned);
  const root = path.join(process.cwd(), "data", "uploads");
  if (!full.startsWith(root)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

/** Load KYC document bytes from Supabase Storage or local disk. */
export async function loadKycDocument(relativePath: string) {
  return loadKycObject(relativePath);
}

export async function submit(actorId: string, input: KycSubmitInput) {
  const actor = await loadActor(actorId);
  assertActive(actor);

  if (actor.kycStatus === "approved") {
    throw new AppError("INVALID_STATE", "KYC already approved");
  }
  if (actor.kycStatus === "pending") {
    throw new AppError("INVALID_STATE", "KYC already pending review");
  }

  const required = [
    input.fullLegalName,
    input.dateOfBirth,
    input.country,
    input.documentType,
    input.documentNumber,
  ];
  if (required.some((v) => !v?.trim())) {
    throw new AppError("VALIDATION", "All KYC identity fields are required");
  }
  if (!input.documentPaths?.length) {
    throw new AppError(
      "VALIDATION",
      "Upload at least one identity document (ID front recommended)",
    );
  }

  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();

  await db.insert(kycSubmissions).values({
    id,
    userId: actor.id,
    status: "pending",
    fullLegalName: input.fullLegalName.trim(),
    dateOfBirth: input.dateOfBirth.trim(),
    country: input.country.trim(),
    documentType: input.documentType.trim(),
    documentNumber: input.documentNumber.trim(),
    documentPaths: JSON.stringify(input.documentPaths),
    createdAt,
  });

  await db
    .update(users)
    .set({ kycStatus: "pending", updatedAt: createdAt })
    .where(eq(users.id, actor.id));

  await logEvent({
    actorId: actor.id,
    action: "kyc.submit",
    resourceType: "kyc_submission",
    resourceId: id,
  });

  await notifyKycStatus(actor.id, "submitted");

  const createdRows = (await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, id))) as any[];
  return createdRows[0]!;
}

export async function getLatestForUser(actorId: string, userId: string) {
  const actor = await loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  const rows = (await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.userId, userId))
    .orderBy(desc(kycSubmissions.createdAt))) as any[];
  return rows[0];
}

export async function listQueue(actorId: string) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return (await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.status, "pending"))
    .orderBy(desc(kycSubmissions.createdAt))) as any[];
}

export async function listAll(actorId: string, limit = 100) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const rows = (await db
    .select()
    .from(kycSubmissions)
    .orderBy(desc(kycSubmissions.createdAt))) as any[];
  return rows.slice(0, limit);
}

export async function getSubmission(actorId: string, submissionId: string) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const rows = (await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))) as any[];
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Submission not found", 404);
  const userRows = (await db
    .select()
    .from(users)
    .where(eq(users.id, row.userId))) as any[];
  const user = userRows[0];
  return {
    ...row,
    documentPaths: JSON.parse(row.documentPaths || "[]") as string[],
    userEmail: user?.email,
    userName: user?.name,
  };
}

export async function review(
  actorId: string,
  submissionId: string,
  decision: "approved" | "rejected",
  note?: string,
) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const rows = (await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))) as any[];
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Submission not found", 404);
  if (row.status !== "pending") {
    throw new AppError("INVALID_STATE", "Already reviewed");
  }
  const now = nowIso();
  await db
    .update(kycSubmissions)
    .set({
      status: decision,
      reviewerNote: note,
      reviewedBy: actor.id,
      reviewedAt: now,
    })
    .where(eq(kycSubmissions.id, submissionId));
  await db
    .update(users)
    .set({ kycStatus: decision, updatedAt: now })
    .where(eq(users.id, row.userId));

  await logEvent({
    actorId: actor.id,
    action: `kyc.${decision}`,
    resourceType: "kyc_submission",
    resourceId: submissionId,
    meta: { userId: row.userId, note },
  });

  await notifyKycStatus(row.userId, decision, note);

  const updatedRows = (await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))) as any[];
  return updatedRows[0]!;
}
