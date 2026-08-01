export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import {
  getAllDepositAddresses,
  listSupportedAssets,
  getPrices,
  listUserDeposits,
} from "@/lib/services/crypto";
import { getBalances } from "@/lib/services/ledger";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { DepositForm } from "@/components/dashboard/DepositForm";
import { LivePrices } from "@/components/dashboard/LivePrices";

function statusTone(status: string) {
  if (status === "pending") return "warning" as const;
  if (status === "confirmed") return "success" as const;
  if (status === "failed" || status === "cancelled") return "danger" as const;
  return "neutral" as const;
}

export default async function DepositPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");
  const balance = await getBalances(session.user.id);
  const assets = listSupportedAssets();
  const addresses = await getAllDepositAddresses();
  const deposits = await listUserDeposits(session.user.id, session.user.id);
  let prices: Awaited<ReturnType<typeof getPrices>> = [];
  try {
    prices = await getPrices();
  } catch {
    prices = [];
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Deposit</h1>
        <p className="text-sm text-white/45">
          Send crypto to the platform wallet, then submit a deposit report.
          Balance is credited after admin confirmation.
        </p>
      </div>

      <Island>
        <IslandBody className="pt-5">
          <div className="text-xs uppercase text-white/40">Available cash</div>
          <div className="text-3xl font-semibold tabular-nums">
            {formatUsd(balance.availableCents)}
          </div>
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Live prices</span>
          <Badge tone="accent">CoinGecko</Badge>
        </IslandHeader>
        <IslandBody>
          <LivePrices initial={prices} />
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Supported assets</span>
        </IslandHeader>
        <IslandBody className="flex flex-wrap gap-2">
          {assets.map((a: any) => (
            <Badge key={a.symbol} tone={a.primary ? "accent" : "neutral"}>
              {a.symbol}
              {a.primary ? " · primary" : ""}
            </Badge>
          ))}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Report a deposit</span>
        </IslandHeader>
        <IslandBody>
          <DepositForm addresses={addresses} initialPrices={prices} />
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Your deposit reports</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {deposits.length === 0 && (
            <p className="text-sm text-white/40">No deposits yet.</p>
          )}
          {deposits.map((d: any) => (
            <div
              key={d.id}
              className="rounded-xl border border-white/8 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium tabular-nums">
                  {formatUsd(d.amountCents)} · {d.asset}
                </span>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
              </div>
              {d.txRef && (
                <code className="mt-2 block break-all text-[11px] text-white/40">
                  {d.txRef}
                </code>
              )}
              <div className="mt-1 text-xs text-white/35">
                {d.createdAt.slice(0, 16).replace("T", " ")}
              </div>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
