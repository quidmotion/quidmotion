export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { getBalances } from "@/lib/services/ledger";
import { listUserPayouts } from "@/lib/services/payouts";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { WithdrawForm } from "@/components/dashboard/WithdrawForm";

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

export default async function WithdrawPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");
  const balance = getBalances(session.user.id);
  const kycApproved = session.user.kycStatus === "approved";
  const history = listUserPayouts(session.user.id, session.user.id).filter(
    (p: any) => p.payoutType === "withdrawal",
  );

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Withdraw</h1>
        <p className="text-sm text-white/45">
          KYC-approved accounts only. Provide a withdrawal address; admin review
          is required before funds are sent.
        </p>
      </div>
      <Island>
        <IslandBody className="pt-5">
          <div className="text-xs uppercase text-white/40">Withdrawable</div>
          <div className="text-3xl font-semibold tabular-nums">
            {formatUsd(balance.availableCents)}
          </div>
          {!kycApproved && (
            <p className="mt-2 text-sm text-amber-300">
              KYC not approved.{" "}
              <Link href="/dashboard/settings" className="underline">
                Complete verification
              </Link>
            </p>
          )}
        </IslandBody>
      </Island>
      <Island>
        <IslandHeader>
          <span className="font-medium">Request withdrawal</span>
        </IslandHeader>
        <IslandBody>
          <WithdrawForm
            kycApproved={kycApproved}
            availableUsd={balance.availableCents / 100}
          />
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Your withdrawal requests</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-white/40">No withdrawals yet.</p>
          )}
          {history.map((p: any) => (
            <div
              key={p.id}
              className="rounded-xl border border-white/8 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium tabular-nums">
                  {formatUsd(p.amountCents)}
                </span>
                <Badge tone={statusTone(p.status)}>
                  {statusLabel(p.status)}
                </Badge>
              </div>
              {p.withdrawalAddress && (
                <code className="mt-2 block break-all text-[11px] text-white/40">
                  {p.withdrawalAddress}
                </code>
              )}
              <div className="mt-1 text-xs text-white/35">
                {p.createdAt.slice(0, 16).replace("T", " ")}
                {p.withdrawalAsset ? ` · ${p.withdrawalAsset}` : ""}
              </div>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
