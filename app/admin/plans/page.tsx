export const dynamic = "force-dynamic";
import { getAuth } from "@/lib/auth";
import { listPlans } from "@/lib/services/investments";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";

export default async function AdminPlansPage() {
  const session = await getAuth().getSession();
  // ensure admin session context for future mutations
  void session;
  const plans = await listPlans();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold sm:text-2xl">Investment plans</h1>
      <Island>
        <IslandHeader>
          <span className="font-medium">{plans.length} active plans</span>
        </IslandHeader>
        <IslandBody className="space-y-3">
          {plans.map((p: any) => (
            <div
              key={p.id}
              className="rounded-xl border border-white/8 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="min-w-0 break-words font-medium">{p.name}</h2>
                <Badge tone="accent">{p.riskTier}</Badge>
              </div>
              <p className="mt-1 text-sm text-white/50">{p.description}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/45">
                <span>Min {formatUsd(p.minInvestmentCents)}</span>
                <span>
                  APY {(p.apyMinBps / 100).toFixed(1)}–
                  {(p.apyMaxBps / 100).toFixed(1)}%
                </span>
                <span>{p.lockupDays} day lock-up</span>
              </div>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
