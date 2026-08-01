import { getAuth } from "@/lib/auth";
import { listQueue } from "@/lib/services/kyc";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { reviewKycAction } from "@/lib/actions/admin";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function AdminKycPage() {
  const session = await getAuth().getSession();
  const pending = listQueue(session!.user.id);
  const db = getDb();

  const enriched = pending.map((k) => {
    const user = db.select().from(users).where(eq(users.id, k.userId)).get();
    let paths: string[] = [];
    try {
      paths = JSON.parse(k.documentPaths || "[]");
    } catch {
      paths = [];
    }
    return {
      ...k,
      userEmail: user?.email,
      userName: user?.name,
      paths,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">KYC queue</h1>
        <p className="text-sm text-white/45">
          Review live identity submissions and uploaded documents.
        </p>
      </div>
      <Island>
        <IslandHeader>
          <span className="font-medium">{enriched.length} pending</span>
        </IslandHeader>
        <IslandBody className="space-y-4">
          {enriched.length === 0 && (
            <p className="text-sm text-white/40">Queue is empty.</p>
          )}
          {enriched.map((k) => (
            <div
              key={k.id}
              className="rounded-xl border border-white/8 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    {k.fullLegalName || k.userName || "Applicant"}
                  </div>
                  <div className="text-xs text-white/40">
                    {k.userEmail} · submitted{" "}
                    {k.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              </div>

              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-white/40">Date of birth</dt>
                  <dd>{k.dateOfBirth || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40">Country</dt>
                  <dd>{k.country || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40">Document type</dt>
                  <dd className="capitalize">
                    {(k.documentType || "—").replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40">Document number</dt>
                  <dd className="font-mono text-xs">{k.documentNumber || "—"}</dd>
                </div>
              </dl>

              {k.paths.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs uppercase text-white/40">Documents</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {k.paths.map((rel) => (
                      <a
                        key={rel}
                        href={`/api/uploads/${rel}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-violet-500/15 px-3 py-1 text-xs text-violet-200 hover:bg-violet-500/25"
                      >
                        View {rel.split("/").pop()}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={reviewKycAction}>
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-300"
                  >
                    Approve
                  </button>
                </form>
                <form action={reviewKycAction}>
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <input
                    type="hidden"
                    name="note"
                    value="Documents insufficient or unverifiable"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-medium text-red-300"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
