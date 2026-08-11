import "server-only";
import { eq, desc, and, count } from "drizzle-orm";
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
  const start = (page - 1) * pageSize;
  const db = getDb();

  const whereClause = opts.type
    ? and(eq(transactions.userId, userId), eq(transactions.type, opts.type as any))
    : eq(transactions.userId, userId);

  const [countRows, items] = await Promise.all([
    db.select({ n: count() }).from(transactions).where(whereClause),
    db
      .select()
      .from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.createdAt))
      .limit(pageSize)
      .offset(start),
  ]);

  return {
    items: items as any[],
    total: Number((countRows as any[])[0]?.n ?? 0),
    page,
    pageSize,
  };
}
