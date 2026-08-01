import "server-only";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { assertSelfOrAdmin, loadActor } from "./_authz";

export function listNotifications(actorId: string, userId: string, limit = 10) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .all()
    .slice(0, limit);
}

export function createNotification(input: {
  userId: string;
  title: string;
  body: string;
  kind?: string;
}) {
  const db = getDb();
  const id = randomUUID();
  db.insert(notifications)
    .values({
      id,
      userId: input.userId,
      title: input.title,
      body: input.body,
      kind: input.kind ?? "info",
      createdAt: new Date().toISOString(),
    })
    .run();
  return id;
}

export function markRead(actorId: string, notificationId: string) {
  const actor = loadActor(actorId);
  const db = getDb();
  const row = db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .get();
  if (!row) return;
  assertSelfOrAdmin(actor, row.userId);
  db.update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(eq(notifications.id, notificationId))
    .run();
}
