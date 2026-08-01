import type { Metadata } from "next";
import Link from "next/link";
import { listDocuments } from "@/lib/services/documents";
import { Island, IslandBody } from "@/components/ui/Island";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  const docs = listDocuments();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Legal documents</h1>
      <p className="mt-3 text-white/60">
        Terms, privacy, risk disclosures, and AML/KYC policy.
      </p>
      <div className="mt-10 space-y-3">
        {docs.map((d: any) => (
          <Link key={d.slug} href={`/documents/${d.slug}`}>
            <Island className="mb-3 transition hover:border-violet-500/30">
              <IslandBody className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-white/40">
                    Updated {d.lastUpdated.slice(0, 10)}
                  </div>
                </div>
                <span className="text-white/40">→</span>
              </IslandBody>
            </Island>
          </Link>
        ))}
      </div>
    </div>
  );
}
