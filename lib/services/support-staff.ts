import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, supportPrivileges, userBalances } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/crypto/password";
import {
  defaultSupportPrivileges,
  normalizePrivilegeMap,
  parsePrivilegesJson,
  privilegesToJson,
  type PrivilegeKey,
  type PrivilegeMap,
} from "@/lib/auth/privileges";
import { assertAdmin, loadActor } from "./_authz";
import { logEvent } from "./audit";

function nowIso() {
  return new Date().toISOString();
}

export async function listSupportStaff(actorId: string) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const staff = (await db
    .select()
    .from(users)
    .where(eq(users.role, "support"))
    .orderBy(desc(users.createdAt))) as any[];

  return Promise.all(
    staff.map(async (u: any) => {
      const privRows = (await db
        .select()
        .from(supportPrivileges)
        .where(eq(supportPrivileges.userId, u.id))) as any[];
      const privileges = privRows[0]
        ? parsePrivilegesJson(privRows[0].privileges)
        : defaultSupportPrivileges();
      const { passwordHash: _, ...safe } = u;
      return { ...safe, privileges };
    }),
  );
}

export async function createSupportStaff(
  actorId: string,
  input: { name: string; email: string; password: string },
) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name) {
    throw new AppError("VALIDATION", "Name and email are required");
  }
  if (!input.password || input.password.length < 8) {
    throw new AppError("VALIDATION", "Password must be at least 8 characters");
  }

  const db = getDb();
  const existing = (await db
    .select()
    .from(users)
    .where(eq(users.email, email))) as any[];
  if (existing[0]) {
    throw new AppError("CONFLICT", "Email already registered", 409);
  }

  const id = randomUUID();
  const now = nowIso();
  const passwordHash = hashPassword(input.password);
  const referralCode = randomBytes(4).toString("hex").toUpperCase();
  const privileges = defaultSupportPrivileges();

  await db.insert(users).values({
    id,
    email,
    name,
    passwordHash,
    role: "support",
    kycStatus: "none",
    status: "active",
    referralCode,
    referredBy: null,
    createdAt: now,
    updatedAt: now,
    lockupDays: 0,
  });

  await db.insert(userBalances).values({
    userId: id,
    availableCents: 0,
    lockedCents: 0,
    updatedAt: now,
  });

  await db.insert(supportPrivileges).values({
    userId: id,
    privileges: privilegesToJson(privileges),
    createdAt: now,
    updatedAt: now,
    updatedBy: actor.id,
  });

  await logEvent({
    actorId: actor.id,
    action: "support_staff.create",
    resourceType: "user",
    resourceId: id,
    meta: { email },
  });

  return { id, email, name, role: "support" as const, privileges };
}

export async function updateSupportPrivileges(
  actorId: string,
  supportUserId: string,
  privileges: Partial<Record<PrivilegeKey, boolean>>,
) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);

  const db = getDb();
  const rows = (await db
    .select()
    .from(users)
    .where(eq(users.id, supportUserId))) as any[];
  const user = rows[0];
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  if (user.role !== "support") {
    throw new AppError("VALIDATION", "Target is not a support account");
  }

  const map = normalizePrivilegeMap(privileges);
  const now = nowIso();
  const existing = (await db
    .select()
    .from(supportPrivileges)
    .where(eq(supportPrivileges.userId, supportUserId))) as any[];

  if (existing[0]) {
    await db
      .update(supportPrivileges)
      .set({
        privileges: privilegesToJson(map),
        updatedAt: now,
        updatedBy: actor.id,
      })
      .where(eq(supportPrivileges.userId, supportUserId));
  } else {
    await db.insert(supportPrivileges).values({
      userId: supportUserId,
      privileges: privilegesToJson(map),
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    });
  }

  await logEvent({
    actorId: actor.id,
    action: "support_staff.privileges_update",
    resourceType: "user",
    resourceId: supportUserId,
    meta: { privileges: map },
  });

  return map;
}

export async function setSupportStaffPassword(
  actorId: string,
  supportUserId: string,
  newPassword: string,
) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  if (!newPassword || newPassword.length < 8) {
    throw new AppError("VALIDATION", "Password must be at least 8 characters");
  }

  const db = getDb();
  const rows = (await db
    .select()
    .from(users)
    .where(eq(users.id, supportUserId))) as any[];
  const user = rows[0];
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  if (user.role !== "support") {
    throw new AppError("VALIDATION", "Target is not a support account");
  }

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(newPassword),
      updatedAt: nowIso(),
    })
    .where(eq(users.id, supportUserId));

  await logEvent({
    actorId: actor.id,
    action: "support_staff.password_reset",
    resourceType: "user",
    resourceId: supportUserId,
  });
}

export async function getPrivilegesForUser(
  userId: string,
): Promise<PrivilegeMap> {
  const db = getDb();
  const userRows = (await db
    .select()
    .from(users)
    .where(eq(users.id, userId))) as any[];
  const user = userRows[0];
  if (!user) return defaultSupportPrivileges();
  if (user.role === "admin") {
    const { allPrivilegesOn } = await import("@/lib/auth/privileges");
    return allPrivilegesOn();
  }
  if (user.role !== "support") {
    const { emptyPrivileges } = await import("@/lib/auth/privileges");
    return emptyPrivileges();
  }
  const privRows = (await db
    .select()
    .from(supportPrivileges)
    .where(eq(supportPrivileges.userId, userId))) as any[];
  if (!privRows[0]) return defaultSupportPrivileges();
  return parsePrivilegesJson(privRows[0].privileges);
}
