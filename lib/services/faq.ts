import "server-only";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faqEntries } from "@/lib/db/schema";

export function listFaq(opts: { category?: string; q?: string } = {}) {
  const db = getDb();
  let rows = db
    .select()
    .from(faqEntries)
    .orderBy(asc(faqEntries.sortOrder))
    .all()
    .filter((r) => r.published);

  if (opts.category) {
    rows = rows.filter((r) => r.category === opts.category);
  }
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.question.toLowerCase().includes(q) ||
        r.answer.toLowerCase().includes(q),
    );
  }
  return rows;
}

export function listCategories() {
  const rows = listFaq();
  return [...new Set(rows.map((r) => r.category))];
}
