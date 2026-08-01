import { getAuth } from "@/lib/auth";
import {
  listAdminWithdrawals,
} from "@/lib/services/payouts";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { reviewPayoutAction } from "@/lib/actions/admin";

function statusTone(status: string) {
  if (status === "pending_approval") return "warning" as const;
  if (status === "processing") return "accent" as const;
  if (status === "completed") return "success" as const;
  if (status === "rejected") return "danger" as const;
  return "neutral" as const;
}

function statusLabel(status: string) {
  if (status === "pending_approval") return "pending approval";
  return status;
}

export default async function AdminPayoutsPage() {
  const session = await getAuth().getSession();
  const all = listAdminWithdrawals(session!.user.id);
  const pending = all.filter((p) => p.status === "pending_approval");
  const processing = all.filter((p) => p.status === "processing");
  const history = all.filter(
    (p) => p.status === "completed" || p.status === "rejected",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Withdrawals</h1>
        <p className="text-sm text-white/45">
          Review requests, send funds manually to the user&apos;s address, then
          mark completed.
        </p>
      </div>

      <Island>
        <IslandHeader>
          <span className="font-medium">
            Pending approval ({pending.length})
          </span>
        </IslandHeader>
        <IslandBody className="space-y-3">
          {pending.length === 0 && (
            <p className="text-sm text-white/40">No pending withdrawal requests.</p>
          )}
          {pending.map((p) => (
            <WithdrawalCard key={p.id} p={p} mode="pending" />
          ))}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">
            Processing — send funds ({processing.length})
          </span>
        </IslandHeader>
        <IslandBody className="space-y-3">
          {processing.length === 0 && (
            <p className="text-sm text-white/40">
              No approved withdrawals awaiting on-chain transfer.
            </p>
          )}
          {processing.map((p) => (
            <WithdrawalCard key={p.id} p={p} mode="processing" />
          ))}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">History ({history.length})</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-white/40">No completed or rejected items yet.</p>
          )}
          {history.slice(0, 30).map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium tabular-nums">
                  {formatUsd(p.amountCents)}
                </div>
                <div className="text-xs text-white/40">
                  {p.userEmail ?? p.userId.slice(0, 8)} ·{" "}
                  {p.createdAt.slice(0, 10)}
                </div>
              </div>
              <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}

function WithdrawalCard({
  p,
  mode,
}: {
  p: {
    id: string;
    amountCents: number;
    userId: string;
    userEmail?: string | null;
    userName?: string | null;
    withdrawalAddress: string | null;
    withdrawalAsset: string | null;
    withdrawalNetwork: string | null;
    createdAt: string;
    status: string;
    note: string | null;
  };
  mode: "pending" | "processing";
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tabular-nums">
            {formatUsd(p.amountCents)}
          </div>
          <div className="mt-1 text-sm text-white/55">
            {p.userName ?? "User"} · {p.userEmail ?? p.userId.slice(0, 8)}
          </div>
          <div className="mt-1 text-xs text-white/40">
            Requested {p.createdAt.slice(0, 16).replace("T", " ")} ·{" "}
            {p.withdrawalAsset ?? "USDT"} on {p.withdrawalNetwork ?? "—"}
          </div>
        </div>
        <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
      </div>

      <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/10 p-3">
        <div className="text-[10px] uppercase tracking-wide text-white/40">
          Withdrawal address — send funds here
        </div>
        <code className="mt-1 block break-all font-mono text-xs text-violet-200">
          {p.withdrawalAddress ?? "— missing —"}
        </code>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {mode === "pending" && (
          <>
            <form action={reviewPayoutAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="decision" value="approve" />
              <button
                type="submit"
                className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
              >
                Approve → processing
              </button>
            </form>
            <form action={reviewPayoutAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="decision" value="reject" />
              <input type="hidden" name="note" value="Rejected by admin" />
              <button
                type="submit"
                className="rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30"
              >
                Reject & refund
              </button>
            </form>
          </>
        )}
        {mode === "processing" && (
          <>
            <form action={reviewPayoutAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="decision" value="complete" />
              <input
                type="hidden"
                name="note"
                value="Manual on-chain transfer completed by admin"
              />
              <button
                type="submit"
                className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
              >
                Mark completed
              </button>
            </form>
            <form action={reviewPayoutAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="decision" value="reject" />
              <input
                type="hidden"
                name="note"
                value="Cancelled during processing — funds restored"
              />
              <button
                type="submit"
                className="rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30"
              >
                Cancel & refund
              </button>
            </form>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] text-white/30">
        {mode === "pending"
          ? "Approving moves status to processing. Then send crypto to the address above."
          : "After you have sent the funds on-chain, mark completed to email the user."}
      </p>
    </div>
  );
}
