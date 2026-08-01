import "server-only";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertAdmin, loadActor } from "./_authz";
import { logEvent } from "./audit";

function nowIso() {
  return new Date().toISOString();
}

export function listProperties(status?: string) {
  const db = getDb();
  const rows = db
    .select()
    .from(properties)
    .orderBy(desc(properties.createdAt))
    .all();
  if (status) return rows.filter((p: any) => p.status === status);
  return rows.filter((p: any) => p.status === "live" || p.status === "funded");
}

export function getProperty(id: string) {
  const db = getDb();
  return db.select().from(properties).where(eq(properties.id, id)).get();
}

export function listFeatured(limit = 6) {
  const db = getDb();
  return db
    .select()
    .from(properties)
    .orderBy(desc(properties.createdAt))
    .all()
    .filter((p: any) => p.featured && (p.status === "live" || p.status === "funded"))
    .slice(0, limit);
}

export function listAllAdmin(actorId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return db.select().from(properties).orderBy(desc(properties.createdAt)).all();
}

export type PropertyInput = {
  name: string;
  location: string;
  description: string;
  imageUrl?: string;
  targetRaiseCents: number;
  raisedCents?: number;
  expectedApyBps: number;
  status?: "draft" | "live" | "funded" | "closed";
  featured?: boolean;
};

export function createProperty(actorId: string, input: PropertyInput) {
  const actor = loadActor(actorId);
  assertAdmin(actor);

  if (!input.name?.trim() || !input.location?.trim() || !input.description?.trim()) {
    throw new AppError("VALIDATION", "Name, location, and description are required");
  }
  if (input.targetRaiseCents <= 0) {
    throw new AppError("VALIDATION", "Target raise must be positive");
  }
  if (input.expectedApyBps <= 0) {
    throw new AppError("VALIDATION", "Expected APY must be positive");
  }

  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();

  db.insert(properties)
    .values({
      id,
      name: input.name.trim(),
      location: input.location.trim(),
      description: input.description.trim(),
      imageUrl: input.imageUrl?.trim() || null,
      targetRaiseCents: input.targetRaiseCents,
      raisedCents: input.raisedCents ?? 0,
      status: input.status ?? "live",
      expectedApyBps: input.expectedApyBps,
      featured: input.featured ?? true,
      createdAt,
      updatedAt: createdAt,
    })
    .run();

  logEvent({
    actorId: actor.id,
    action: "property.create",
    resourceType: "property",
    resourceId: id,
  });

  return getProperty(id)!;
}

export function updateProperty(
  actorId: string,
  propertyId: string,
  input: Partial<PropertyInput>,
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const existing = getProperty(propertyId);
  if (!existing) throw new AppError("NOT_FOUND", "Property not found", 404);

  const updatedAt = nowIso();
  db.update(properties)
    .set({
      name: input.name?.trim() ?? existing.name,
      location: input.location?.trim() ?? existing.location,
      description: input.description?.trim() ?? existing.description,
      imageUrl:
        input.imageUrl !== undefined
          ? input.imageUrl.trim() || null
          : existing.imageUrl,
      targetRaiseCents: input.targetRaiseCents ?? existing.targetRaiseCents,
      raisedCents: input.raisedCents ?? existing.raisedCents,
      expectedApyBps: input.expectedApyBps ?? existing.expectedApyBps,
      status: input.status ?? existing.status,
      featured: input.featured ?? existing.featured,
      updatedAt,
    })
    .where(eq(properties.id, propertyId))
    .run();

  logEvent({
    actorId: actor.id,
    action: "property.update",
    resourceType: "property",
    resourceId: propertyId,
  });

  return getProperty(propertyId)!;
}

export function deleteProperty(actorId: string, propertyId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const existing = getProperty(propertyId);
  if (!existing) throw new AppError("NOT_FOUND", "Property not found", 404);
  // Soft-close rather than hard delete to preserve investment FKs
  return updateProperty(actorId, propertyId, { status: "closed", featured: false });
}
