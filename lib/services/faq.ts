import "server-only";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faqEntries } from "@/lib/db/schema";

import type { InferSelectModel } from "drizzle-orm";

export type FaqEntry = InferSelectModel<typeof faqEntries>;

export async function listFaq(opts: { category?: string; q?: string } = {}): Promise<FaqEntry[]> {
  const db = getDb();
  let rows = ((await db
    .select()
    .from(faqEntries)
    .orderBy(asc(faqEntries.sortOrder))) as FaqEntry[])
    .filter((r: any) => r.published);

  if (opts.category) {
    rows = rows.filter((r: any) => r.category === opts.category);
  }
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter(
      (r: any) =>
        r.question.toLowerCase().includes(q) ||
        r.answer.toLowerCase().includes(q),
    );
  }
  return rows;
}

export async function listCategories(): Promise<string[]> {
  const rows = await listFaq();
  return [...new Set(rows.map((r: any) => r.category as string))];
}
