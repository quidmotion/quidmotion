import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { features } from "@/lib/config/features";

export async function captureLead(email: string, source = "guide") {
  if (!features.leadMagnet) {
    throw new AppError("FORBIDDEN", "Lead magnet disabled", 403);
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) {
    throw new AppError("VALIDATION", "Valid email required");
  }
  const db = getDb();
  const id = randomUUID();
  await db.insert(leads).values({
    id,
    email: trimmed,
    source,
    createdAt: new Date().toISOString(),
  });
  return { id, email: trimmed };
}
