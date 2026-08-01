import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { kycSubmissions, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertActive, assertAdmin, assertSelfOrAdmin, loadActor } from "./_authz";
import { notifyKycStatus } from "./email";
import { logEvent } from "./audit";

export type KycSubmitInput = {
  fullLegalName: string;
  dateOfBirth: string;
  country: string;
  documentType: string;
  documentNumber: string;
  /** Relative paths under data/uploads already saved by the action layer */
  documentPaths: string[];
};

function nowIso() {
  return new Date().toISOString();
}

export function getUploadsRoot() {
  return path.join(process.cwd(), "data", "uploads", "kyc");
}

/** Persist an uploaded file buffer for a user; returns relative path. */
export function saveKycFile(
  userId: string,
  filename: string,
  data: Buffer,
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const dir = path.join(getUploadsRoot(), userId);
  fs.mkdirSync(dir, { recursive: true });
  const stored = `${Date.now()}_${safeName}`;
  const full = path.join(dir, stored);
  fs.writeFileSync(full, data);
  return path.join("kyc", userId, stored).replace(/\\/g, "/");
}

export function resolveUploadPath(relativePath: string): string | null {
  const cleaned = relativePath.replace(/^[/\\]+/, "").replace(/\.\./g, "");
  const full = path.join(process.cwd(), "data", "uploads", cleaned);
  if (!full.startsWith(path.join(process.cwd(), "data", "uploads"))) {
    return null;
  }
  if (!fs.existsSync(full)) return null;
  return full;
}

export async function submit(actorId: string, input: KycSubmitInput) {
  const actor = loadActor(actorId);
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

  db.insert(kycSubmissions)
    .values({
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
    })
    .run();

  db.update(users)
    .set({ kycStatus: "pending", updatedAt: createdAt })
    .where(eq(users.id, actor.id))
    .run();

  logEvent({
    actorId: actor.id,
    action: "kyc.submit",
    resourceType: "kyc_submission",
    resourceId: id,
  });

  await notifyKycStatus(actor.id, "submitted");

  return db.select().from(kycSubmissions).where(eq(kycSubmissions.id, id)).get()!;
}

export function getLatestForUser(actorId: string, userId: string) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  return db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.userId, userId))
    .orderBy(desc(kycSubmissions.createdAt))
    .all()[0];
}

export function listQueue(actorId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.status, "pending"))
    .orderBy(desc(kycSubmissions.createdAt))
    .all();
}

export function listAll(actorId: string, limit = 100) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return db
    .select()
    .from(kycSubmissions)
    .orderBy(desc(kycSubmissions.createdAt))
    .all()
    .slice(0, limit);
}

export function getSubmission(actorId: string, submissionId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const row = db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))
    .get();
  if (!row) throw new AppError("NOT_FOUND", "Submission not found", 404);
  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
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
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const row = db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))
    .get();
  if (!row) throw new AppError("NOT_FOUND", "Submission not found", 404);
  if (row.status !== "pending") {
    throw new AppError("INVALID_STATE", "Already reviewed");
  }
  const now = nowIso();
  db.update(kycSubmissions)
    .set({
      status: decision,
      reviewerNote: note,
      reviewedBy: actor.id,
      reviewedAt: now,
    })
    .where(eq(kycSubmissions.id, submissionId))
    .run();
  db.update(users)
    .set({ kycStatus: decision, updatedAt: now })
    .where(eq(users.id, row.userId))
    .run();

  logEvent({
    actorId: actor.id,
    action: `kyc.${decision}`,
    resourceType: "kyc_submission",
    resourceId: submissionId,
    meta: { userId: row.userId, note },
  });

  await notifyKycStatus(row.userId, decision, note);

  return db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))
    .get()!;
}
