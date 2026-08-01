import "server-only";
import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { assertAdmin, loadActor } from "./_authz";

export function logEvent(input: {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  meta?: Record<string, unknown>;
}) {
  const db = getDb();
  db.insert(auditEvents)
    .values({
      id: randomUUID(),
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

import type { InferSelectModel } from "drizzle-orm";

export type AuditEvent = InferSelectModel<typeof auditEvents>;

export function listAudit(actorId: string, limit = 100): AuditEvent[] {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return (db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .all() as AuditEvent[])
    .slice(0, limit);
}
