import "server-only";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { assertSelfOrAdmin, loadActor } from "./_authz";

export async function listTransactions(
  actorId: string,
  userId: string,
  opts: { page?: number; pageSize?: number; type?: string } = {},
) {
  const actor = await loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const db = getDb();

  let rows = (await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))) as any[];

  if (opts.type) {
    rows = rows.filter((r: any) => r.type === opts.type);
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
