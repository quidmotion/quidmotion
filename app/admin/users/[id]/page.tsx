export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser, setUserStatus } from "@/lib/services/users";
import { getPortfolioSummary, listPlans } from "@/lib/services/investments";
import { listTransactions } from "@/lib/services/transactions";
import { listUserTransfers } from "@/lib/services/transfers";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { requireFullAdmin } from "@/lib/admin/guard";
import { getAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { isAppError } from "@/lib/errors";

async function toggleStatus(formData: FormData) {
  "use server";
  const session = await getAuth().getSession();
  if (!session) return;
  const userId = String(formData.get("userId"));
  const status = String(formData.get("status")) as "active" | "suspended";
  await setUserStatus(session.user.id, userId, status);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

function kycTone(status: string) {
  if (status === "approved") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  return "neutral" as const;
}

function txTone(status: string) {
  if (status === "confirmed") return "success" as const;
  if (status === "failed" || status === "cancelled") return "danger" as const;
  return "neutral" as const;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireFullAdmin();
  const { id } = await params;

  let user: Awaited<ReturnType<typeof getUser>>;
  try {
    user = await getUser(ctx.user.id, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const [summary, txPage, transfers, plans] = await Promise.all([
    getPortfolioSummary(ctx.user.id, id),
    listTransactions(ctx.user.id, id, { pageSize: 25 }),
    listUserTransfers(ctx.user.id, id),
    listPlans(),
  ]);

  const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
  const investments = summary.investments ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/users"
            className="text-xs text-violet-300 hover:text-violet-200"
          >
            ← All users
          </Link>
          <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{user.name}</h1>
          <p className="text-sm text-white/50">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={user.status === "active" ? "success" : "danger"}>
            {user.status}
          </Badge>
          <Badge tone={kycTone(user.kycStatus)}>KYC {user.kycStatus}</Badge>
          <Badge tone="neutral">{user.role}</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Island>
          <IslandBody className="pt-5">
            <div className="text-xs uppercase text-white/40">Available</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(summary.availableCents)}
            </div>
          </IslandBody>
        </Island>
        <Island>
          <IslandBody className="pt-5">
            <div className="text-xs uppercase text-white/40">Invested</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(summary.investedCents)}
            </div>
          </IslandBody>
        </Island>
        <Island>
          <IslandBody className="pt-5">
            <div className="text-xs uppercase text-white/40">Total value</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(summary.totalValueCents)}
            </div>
          </IslandBody>
        </Island>
      </div>

      <Island>
        <IslandHeader>
          <span className="font-medium">Account</span>
        </IslandHeader>
        <IslandBody className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-white/40">User ID</div>
            <div className="mt-0.5 break-all font-mono text-xs text-white/70">
              {user.id}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-white/40">Joined</div>
            <div className="mt-0.5 text-white/70">
              {String(user.createdAt).slice(0, 16).replace("T", " ")}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-white/40">Referral code</div>
            <div className="mt-0.5 text-white/70">{user.referralCode}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-white/40">ROI to date</div>
            <div className="mt-0.5 tabular-nums text-emerald-300">
              {formatUsd(summary.roiToDateCents)}
            </div>
          </div>
          {user.role !== "admin" && (
            <form action={toggleStatus} className="sm:col-span-2">
              <input type="hidden" name="userId" value={user.id} />
              <input
                type="hidden"
                name="status"
                value={user.status === "active" ? "suspended" : "active"}
              />
              <button
                type="submit"
                className="rounded-full bg-violet-500/15 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/25"
              >
                {user.status === "active" ? "Suspend account" : "Activate account"}
              </button>
            </form>
          )}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">
            Investment portfolio ({investments.length})
          </span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {investments.length === 0 && (
            <p className="text-sm text-white/40">No investments.</p>
          )}
          {investments.map((i: any) => {
            const plan = planById[i.planId];
            return (
              <div
                key={i.id}
                className="rounded-xl border border-white/8 bg-white/5 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {formatUsd(i.principalCents)}
                  </span>
                  <Badge tone={i.status === "active" ? "success" : "neutral"}>
                    {i.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-white/45">
                  {plan?.name ?? "Plan"}
                  {i.effectiveApyBps != null
                    ? ` · ${(i.effectiveApyBps / 100).toFixed(2)}% effective APY`
                    : ""}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  ROI {formatUsd(i.roiToDateCents)} · started{" "}
                  {String(i.startedAt).slice(0, 10)} · matures{" "}
                  {String(i.maturesAt).slice(0, 10)}
                </div>
              </div>
            );
          })}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">
            Recent transactions ({txPage.total})
          </span>
        </IslandHeader>
        <IslandBody>
          {txPage.items.length === 0 && (
            <p className="text-sm text-white/40">No transactions.</p>
          )}
          <div className="space-y-2">
            {txPage.items.map((tx: any) => (
              <div
                key={tx.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="capitalize">{tx.type}</div>
                  <div className="text-xs text-white/40">
                    {String(tx.createdAt).slice(0, 16).replace("T", " ")} ·{" "}
                    {tx.asset}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">
                    {formatUsd(tx.amountCents)}
                  </span>
                  <Badge tone={txTone(tx.status)}>{tx.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Transfers ({transfers.length})</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {transfers.length === 0 && (
            <p className="text-sm text-white/40">No transfers.</p>
          )}
          {transfers.slice(0, 20).map((t: any) => {
            const isOut = t.fromUserId === user.id;
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
              >
                <div>
                  <div className="tabular-nums font-medium">
                    {isOut ? "−" : "+"}
                    {formatUsd(t.amountCents)}
                  </div>
                  <div className="text-xs text-white/40">
                    {isOut ? "Outgoing" : "Incoming"} ·{" "}
                    {String(t.createdAt).slice(0, 10)}
                  </div>
                </div>
                <Badge
                  tone={
                    t.status === "completed"
                      ? "success"
                      : t.status === "rejected" || t.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {t.status === "pending_approval" ? "pending review" : t.status}
                </Badge>
              </div>
            );
          })}
        </IslandBody>
      </Island>
    </div>
  );
}
