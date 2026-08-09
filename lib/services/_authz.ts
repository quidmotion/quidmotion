import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, supportPrivileges } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { isAdmin, isStaff, type AuthUser, type Role } from "@/lib/auth/types";
import {
  allPrivilegesOn,
  defaultSupportPrivileges,
  emptyPrivileges,
  hasAnyPrivilegeInMap,
  hasPrivilegeInMap,
  parsePrivilegesJson,
  type PrivilegeKey,
  type PrivilegeMap,
} from "@/lib/auth/privileges";

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

/** Admin or support staff with any staff-area access. */
export function assertStaff(actor: AuthUser): void {
  assertActive(actor);
  if (!isStaff(actor.role as Role)) {
    throw new AppError("FORBIDDEN", "Staff access required", 403);
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

export async function loadPrivileges(actor: AuthUser): Promise<PrivilegeMap> {
  if (isAdmin(actor.role as Role)) return allPrivilegesOn();
  if (actor.role !== "support") return emptyPrivileges();

  const db = getDb();
  const rows = (await db
    .select()
    .from(supportPrivileges)
    .where(eq(supportPrivileges.userId, actor.id))) as any[];
  if (!rows[0]) return defaultSupportPrivileges();
  return parsePrivilegesJson(rows[0].privileges);
}

export async function actorHasPrivilege(
  actor: AuthUser,
  key: PrivilegeKey,
): Promise<boolean> {
  assertActive(actor);
  if (isAdmin(actor.role as Role)) return true;
  if (actor.role !== "support") return false;
  const map = await loadPrivileges(actor);
  return hasPrivilegeInMap(map, key);
}

export async function actorHasAnyPrivilege(
  actor: AuthUser,
  keys: PrivilegeKey[],
): Promise<boolean> {
  assertActive(actor);
  if (isAdmin(actor.role as Role)) return true;
  if (actor.role !== "support") return false;
  const map = await loadPrivileges(actor);
  return hasAnyPrivilegeInMap(map, keys);
}

export async function assertPrivilege(
  actor: AuthUser,
  key: PrivilegeKey,
): Promise<void> {
  const ok = await actorHasPrivilege(actor, key);
  if (!ok) {
    throw new AppError(
      "FORBIDDEN",
      `Missing privilege: ${key}`,
      403,
    );
  }
}

export async function assertAnyPrivilege(
  actor: AuthUser,
  keys: PrivilegeKey[],
): Promise<void> {
  const ok = await actorHasAnyPrivilege(actor, keys);
  if (!ok) {
    throw new AppError(
      "FORBIDDEN",
      `Missing privilege: one of ${keys.join(", ")}`,
      403,
    );
  }
}

/** Admin always; support only with the given privilege. */
export async function assertAdminOrPrivilege(
  actor: AuthUser,
  key: PrivilegeKey,
): Promise<void> {
  await assertPrivilege(actor, key);
}
