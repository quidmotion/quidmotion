import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documentsMeta } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertAdmin, loadActor } from "./_authz";
import { features } from "@/lib/config/features";

const DOCS = [
  { slug: "terms", title: "Terms & Conditions", file: "terms.md" },
  { slug: "privacy", title: "Privacy Policy", file: "privacy.md" },
  {
    slug: "risk-disclosure",
    title: "Risk Disclosure",
    file: "risk-disclosure.md",
  },
  { slug: "aml-kyc", title: "AML / KYC Policy", file: "aml-kyc.md" },
];

function readFileContent(file: string): string {
  const p = path.join(process.cwd(), "content", "documents", file);
  if (!fs.existsSync(p)) return `# ${file}\n\nContent coming soon.`;
  return fs.readFileSync(p, "utf8");
}

export async function listDocuments() {
  const db = getDb();
  return Promise.all(
    DOCS.map(async (d: any) => {
      const rows = (await db
        .select()
        .from(documentsMeta)
        .where(eq(documentsMeta.slug, d.slug))) as any[];
      const meta = rows[0];
      return {
        slug: d.slug,
        title: meta?.title ?? d.title,
        lastUpdated:
          meta?.lastUpdated ?? new Date().toISOString().slice(0, 10),
      };
    }),
  );
}

export async function getDocument(slug: string) {
  const def = DOCS.find((d: any) => d.slug === slug);
  if (!def) throw new AppError("NOT_FOUND", "Document not found", 404);
  const db = getDb();
  const rows = (await db
    .select()
    .from(documentsMeta)
    .where(eq(documentsMeta.slug, slug))) as any[];
  const meta = rows[0];
  const body = meta?.bodyOverride ?? readFileContent(def.file);
  return {
    slug,
    title: meta?.title ?? def.title,
    body,
    lastUpdated: meta?.lastUpdated ?? new Date().toISOString().slice(0, 10),
  };
}

export async function updateContent(
  actorId: string,
  slug: string,
  bodyOverride: string,
) {
  if (!features.adminCms) {
    throw new AppError("FORBIDDEN", "CMS disabled", 403);
  }
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const def = DOCS.find((d: any) => d.slug === slug);
  if (!def) throw new AppError("NOT_FOUND", "Document not found", 404);

  const db = getDb();
  const now = new Date().toISOString();
  const existingRows = (await db
    .select()
    .from(documentsMeta)
    .where(eq(documentsMeta.slug, slug))) as any[];
  const existing = existingRows[0];
  if (existing) {
    await db
      .update(documentsMeta)
      .set({ bodyOverride, lastUpdated: now })
      .where(eq(documentsMeta.slug, slug));
  } else {
    await db.insert(documentsMeta).values({
      id: slug,
      slug,
      title: def.title,
      bodyOverride,
      lastUpdated: now,
    });
  }
  return await getDocument(slug);
}
