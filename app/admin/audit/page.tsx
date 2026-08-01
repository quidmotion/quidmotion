export const dynamic = "force-dynamic";
import { getAuth } from "@/lib/auth";
import { listAudit } from "@/lib/services/audit";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";

export default async function AdminAuditPage() {
  const session = await getAuth().getSession();
  const events = listAudit(session!.user.id, 100);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <Island>
        <IslandHeader>
          <span className="font-medium">Recent admin actions</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {events.length === 0 && (
            <p className="text-sm text-white/40">
              No audit events yet. Actions will appear here as admins operate.
            </p>
          )}
          {events.map((e: any) => (
            <div
              key={e.id}
              className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm"
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">{e.action}</span>
                <span className="text-xs text-white/40">
                  {e.createdAt.slice(0, 19).replace("T", " ")}
                </span>
              </div>
              <div className="text-xs text-white/45">
                {e.resourceType}
                {e.resourceId ? ` · ${e.resourceId.slice(0, 12)}` : ""}
              </div>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
