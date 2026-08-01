export const dynamic = "force-dynamic";
import { getAuth } from "@/lib/auth";
import {
  listPendingDeposits,
  listAdminDeposits,
} from "@/lib/services/crypto";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { reviewDepositAction } from "@/lib/actions/admin";

function statusTone(status: string) {
  if (status === "pending") return "warning" as const;
  if (status === "confirmed") return "success" as const;
  if (status === "failed" || status === "cancelled") return "danger" as const;
  return "neutral" as const;
}

export default async function AdminDepositsPage() {
  const session = await getAuth().getSession();
  const pending = await listPendingDeposits(session!.user.id);
  const history = (await listAdminDeposits(session!.user.id, 40)).filter(
    (d: any) => d.status !== "pending",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Deposits</h1>
        <p className="text-sm text-white/45">
          Users report transfers to platform wallets. Verify on-chain, then
          confirm to credit their balance (or reject if not found).
        </p>
      </div>

      <Island>
        <IslandHeader>
          <span className="font-medium">
            Pending confirmation ({pending.length})
          </span>
        </IslandHeader>
        <IslandBody className="space-y-3">
          {pending.length === 0 && (
            <p className="text-sm text-white/40">No pending deposits.</p>
          )}
          {pending.map((d: any) => (
            <div
              key={d.id}
              className="rounded-xl border border-white/8 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatUsd(d.amountCents)}
                  </div>
                  <div className="mt-1 text-sm text-white/55">
                    {d.userName ?? "User"} · {d.userEmail ?? d.userId.slice(0, 8)}
                  </div>
                  <div className="mt-1 text-xs text-white/40">
                    {d.asset}
                    {typeof d.meta?.network === "string"
                      ? ` · ${d.meta.network}`
                      : ""}{" "}
                    · reported {d.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
                <Badge tone="warning">pending</Badge>
              </div>

              {d.txRef && (
                <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/10 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-white/40">
                    User tx reference
                  </div>
                  <code className="mt-1 block break-all font-mono text-xs text-violet-200">
                    {d.txRef}
                  </code>
                </div>
              )}

              {typeof d.meta?.platformAddress === "string" && (
                <p className="mt-2 text-xs text-white/35">
                  Expected platform wallet:{" "}
                  <code className="text-white/50">{d.meta.platformAddress}</code>
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={reviewDepositAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="decision" value="confirm" />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Confirm & credit
                  </button>
                </form>
                <form action={reviewDepositAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <input
                    type="hidden"
                    name="note"
                    value="Transfer not found or amount mismatch"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30"
                  >
                    Reject
                  </button>
                </form>
              </div>
              <p className="mt-2 text-[11px] text-white/30">
                Confirm only after you have verified the transfer arrived at the
                platform deposit address.
              </p>
            </div>
          ))}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">History</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-white/40">No confirmed or rejected deposits yet.</p>
          )}
          {history.map((d: any) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium tabular-nums">
                  {formatUsd(d.amountCents)} · {d.asset}
                </div>
                <div className="text-xs text-white/40">
                  {d.userEmail ?? d.userId.slice(0, 8)} ·{" "}
                  {d.createdAt.slice(0, 10)}
                  {d.txRef ? ` · ${d.txRef.slice(0, 16)}…` : ""}
                </div>
              </div>
              <Badge tone={statusTone(d.status)}>{d.status}</Badge>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
