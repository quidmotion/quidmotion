export const dynamic = "force-dynamic";
import { listDocuments } from "@/lib/services/documents";
import { listFaq } from "@/lib/services/faq";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { requireFullAdmin } from "@/lib/admin/guard";

export default async function AdminContentPage() {
  await requireFullAdmin();
  const docs = await listDocuments();
  const faqs = await listFaq();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Content</h1>
        <p className="text-xs text-white/45 sm:text-sm">
          Documents and FAQ (CMS write path uses DB overrides in production).
        </p>
      </div>
      <Island>
        <IslandHeader>
          <span className="font-medium">Documents</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {docs.map((d: any) => (
            <div
              key={d.slug}
              className="flex flex-col gap-0.5 rounded-xl bg-white/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="min-w-0 break-words">{d.title}</span>
              <span className="shrink-0 text-white/40">/{d.slug}</span>
            </div>
          ))}
        </IslandBody>
      </Island>
      <Island>
        <IslandHeader>
          <span className="font-medium">FAQ entries ({faqs.length})</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {faqs.slice(0, 10).map((f: any) => (
            <div key={f.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
              <div className="text-xs text-violet-300">{f.category}</div>
              <div>{f.question}</div>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
