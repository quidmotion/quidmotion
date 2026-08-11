import "server-only";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { assertSelfOrAdmin, loadActor } from "./_authz";

export async function listNotifications(
  actorId: string,
  userId: string,
  limit = 10,
) {
  const actor = await loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  return (await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)) as any[];
}

export async function createNotification(input: {
  userId: string;
  title: string;
  body: string;
  kind?: string;
}) {
  const db = getDb();
  const id = randomUUID();
  await db.insert(notifications).values({
    id,
    userId: input.userId,
    title: input.title,
    body: input.body,
    kind: input.kind ?? "info",
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function markRead(actorId: string, notificationId: string) {
  const actor = await loadActor(actorId);
  const db = getDb();
  const rows = (await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))) as any[];
  const row = rows[0];
  if (!row) return;
  assertSelfOrAdmin(actor, row.userId);
  await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(eq(notifications.id, notificationId));
}
