import "server-only";
import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { assertSelfOrAdmin, loadActor } from "./_authz";

export function listTransactions(
  actorId: string,
  userId: string,
  opts: { page?: number; pageSize?: number; type?: string } = {},
) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const db = getDb();

  let rows = db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .all();

  if (opts.type) {
    rows = rows.filter((r) => r.type === opts.type);
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}
