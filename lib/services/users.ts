import "server-only";
import { eq, like, or, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertAdmin, assertSelfOrAdmin, loadActor } from "./_authz";

export async function getUser(actorId: string, userId: string) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  const rows = (await db.select().from(users).where(eq(users.id, userId))) as any[];
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "User not found", 404);
  const { passwordHash: _, ...safe } = row;
  return safe;
}

export async function listUsers(
  actorId: string,
  opts: { q?: string; page?: number; pageSize?: number } = {},
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  let rows = (await db.select().from(users).orderBy(desc(users.createdAt))) as any[];
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter(
      (u: any) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q),
    );
  }
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize).map((u: any) => {
      const { passwordHash: _, ...safe } = u;
      return safe;
    }),
    total: rows.length,
  };
}

export async function setUserStatus(
  actorId: string,
  userId: string,
  status: "active" | "suspended",
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  await db.update(users)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId));
  return getUser(actorId, userId);
}
