import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument, listDocuments } from "@/lib/services/documents";
import { Island, IslandBody } from "@/components/ui/Island";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    const doc = getDocument(slug);
    return { title: doc.title };
  } catch {
    return { title: "Document" };
  }
}

export default async function DocumentPage({ params }: Props) {
  const { slug } = await params;
  let doc;
  try {
    doc = getDocument(slug);
  } catch {
    notFound();
  }
  const all = listDocuments();

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
          Documents
        </div>
        {all.map((d) => (
          <Link
            key={d.slug}
            href={`/documents/${d.slug}`}
            className={`block rounded-lg px-3 py-2 text-sm ${
              d.slug === slug
                ? "bg-white/10 text-white"
                : "text-white/50 hover:bg-white/5 hover:text-white"
            }`}
          >
            {d.title}
          </Link>
        ))}
      </aside>
      <Island>
        <IslandBody className="prose prose-invert max-w-none pt-6 prose-headings:tracking-tight prose-p:text-white/65 prose-li:text-white/65">
          <div className="mb-2 text-xs text-white/40">
            Last updated {doc.lastUpdated.slice(0, 10)}
          </div>
          <DocBody body={doc.body} />
        </IslandBody>
      </Island>
    </div>
  );
}

function DocBody({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        if (line.startsWith("# "))
          return (
            <h1 key={i} className="text-3xl font-semibold">
              {line.slice(2)}
            </h1>
          );
        if (line.startsWith("## "))
          return (
            <h2 key={i} className="mt-6 text-xl font-semibold">
              {line.slice(3)}
            </h2>
          );
        if (line.startsWith("- "))
          return (
            <li key={i} className="ml-4 list-disc text-white/65">
              {line.slice(2)}
            </li>
          );
        if (!line.trim()) return <div key={i} className="h-2" />;
        return (
          <p key={i} className="text-sm leading-relaxed text-white/65">
            {line}
          </p>
        );
      })}
    </div>
  );
}
