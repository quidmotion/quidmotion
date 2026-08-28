export const dynamic = "force-dynamic";
import { listAdminTransfers } from "@/lib/services/transfers";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { reviewTransferAction } from "@/lib/actions/admin";
import { requireAdminPath, staffHasPrivilege } from "@/lib/admin/guard";

function statusTone(status: string) {
  if (status === "pending_approval") return "warning" as const;
  if (status === "completed") return "success" as const;
  if (status === "rejected" || status === "failed") return "danger" as const;
  return "neutral" as const;
}

function statusLabel(status: string) {
  if (status === "pending_approval") return "pending approval";
  return status;
}

export default async function AdminTransfersPage() {
  const ctx = await requireAdminPath("/admin/transfers");
  const canReview = await staffHasPrivilege(ctx, "transfers.review");
  const all = await listAdminTransfers(ctx.user.id);
  const pending = all.filter((t: any) => t.status === "pending_approval");
  const history = all.filter((t: any) => t.status !== "pending_approval");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Transfers</h1>
        <p className="text-xs text-white/45 sm:text-sm">
          Review KYC-verified user-to-user balance transfers. Approving credits
          the recipient; rejecting refunds the sender.
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
            <p className="text-sm text-white/40">No pending transfers.</p>
          )}
          {pending.map((t: any) => (
            <TransferCard key={t.id} t={t} canReview={canReview} />
          ))}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">History ({history.length})</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-white/40">
              No completed or rejected transfers yet.
            </p>
          )}
          {history.slice(0, 40).map((t: any) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium tabular-nums">
                  {formatUsd(t.amountCents)}
                </div>
                <div className="truncate text-xs text-white/40">
                  {t.fromName ?? t.fromEmail} → {t.toName ?? t.toEmail} ·{" "}
                  {String(t.createdAt).slice(0, 10)}
                </div>
              </div>
              <Badge tone={statusTone(t.status)}>
                {statusLabel(t.status)}
              </Badge>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}

function TransferCard({
  t,
  canReview,
}: {
  t: {
    id: string;
    amountCents: number;
    fromUserId: string;
    toUserId: string;
    fromEmail?: string | null;
    fromName?: string | null;
    toEmail?: string | null;
    toName?: string | null;
    note: string | null;
    createdAt: string;
    status: string;
  };
  canReview: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tabular-nums">
            {formatUsd(t.amountCents)}
          </div>
          <div className="mt-1 text-sm text-white/55">
            {t.fromName ?? "Sender"} · {t.fromEmail ?? t.fromUserId.slice(0, 8)}
          </div>
          <div className="mt-0.5 text-sm text-white/45">
            → {t.toName ?? "Recipient"} · {t.toEmail ?? t.toUserId.slice(0, 8)}
          </div>
          <div className="mt-1 text-xs text-white/40">
            Requested {String(t.createdAt).slice(0, 16).replace("T", " ")}
          </div>
        </div>
        <Badge tone={statusTone(t.status)}>{statusLabel(t.status)}</Badge>
      </div>

      {t.note && (
        <p className="mt-3 text-xs text-white/45">Note: {t.note}</p>
      )}

      {canReview ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={reviewTransferAction}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="decision" value="approve" />
            <button
              type="submit"
              className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
            >
              Approve
            </button>
          </form>
          <form action={reviewTransferAction}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="decision" value="reject" />
            <input type="hidden" name="note" value="Rejected by admin" />
            <button
              type="submit"
              className="rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30"
            >
              Reject &amp; refund
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-3 text-xs text-white/35">
          View only — you do not have transfer review privilege.
        </p>
      )}
    </div>
  );
}
