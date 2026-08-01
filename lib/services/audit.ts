import "server-only";
import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { assertAdmin, loadActor } from "./_authz";

export async function logEvent(input: {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  meta?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(auditEvents).values({
    id: randomUUID(),
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    createdAt: new Date().toISOString(),
  });
}

export type AuditEvent = InferSelectModel<typeof auditEvents>;

export async function listAudit(
  actorId: string,
  limit = 100,
): Promise<AuditEvent[]> {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const rows = (await db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))) as AuditEvent[];
  return rows.slice(0, limit);
}
