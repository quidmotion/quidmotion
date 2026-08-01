import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { isAdmin, type AuthUser, type Role } from "@/lib/auth/types";

export function assertAuthenticated(actor: AuthUser | null | undefined): AuthUser {
  if (!actor) throw new AppError("UNAUTHORIZED", "Sign in required", 401);
  return actor;
}

export function assertActive(actor: AuthUser): void {
  if (actor.status === "suspended") {
    throw new AppError("FORBIDDEN", "Account suspended", 403);
  }
}

export function assertAdmin(actor: AuthUser): void {
  assertActive(actor);
  if (!isAdmin(actor.role as Role)) {
    throw new AppError("FORBIDDEN", "Admin access required", 403);
  }
}

export function assertSelfOrAdmin(actor: AuthUser, userId: string): void {
  assertActive(actor);
  if (actor.id !== userId && !isAdmin(actor.role as Role)) {
    throw new AppError("FORBIDDEN", "Not allowed", 403);
  }
}

export function assertKycApproved(actor: AuthUser): void {
  if (actor.kycStatus !== "approved") {
    throw new AppError(
      "KYC_REQUIRED",
      "KYC approval required for this action",
      403,
    );
  }
}

/** Load fresh user row for service calls (role/status/kyc may have changed). */
export async function loadActor(actorId: string): Promise<AuthUser> {
  const db = getDb();
  const rows = (await db
    .select()
    .from(users)
    .where(eq(users.id, actorId))) as any[];
  const row = rows[0];
  if (!row) throw new AppError("UNAUTHORIZED", "User not found", 401);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    kycStatus: row.kycStatus,
    status: row.status,
    avatarUrl: row.avatarUrl,
    referralCode: row.referralCode,
    createdAt: row.createdAt,
    lockupDays: row.lockupDays ?? 90,
  };
}
