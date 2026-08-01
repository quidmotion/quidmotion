export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { listPlans } from "@/lib/services/investments";
import { formatUsd } from "@/lib/money";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import {
  InvestmentDisclaimer,
  RiskCallout,
} from "@/components/shared/InvestmentDisclaimer";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";

export const metadata: Metadata = { title: "Investment Plans" };

export default async function PlansPage() {
  const plans = await listPlans();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Investment plans</h1>
      <p className="mt-3 max-w-2xl text-white/60">
        Transparent tiers with minimums, projected APY ranges, and lock-up
        periods. All figures are illustrative for this demo.
      </p>
      <div className="mt-6">
        <RiskCallout />
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {plans.map((plan, i) => (
          <Card
            key={plan.id}
            className={
              i === 1
                ? "border-violet-500/40 bg-violet-500/5 ring-1 ring-violet-500/20"
                : undefined
            }
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <Badge tone={i === 1 ? "accent" : "neutral"}>{plan.riskTier}</Badge>
            </div>
            <p className="mt-2 text-sm text-white/50">{plan.description}</p>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-white/40">Minimum</dt>
                <dd className="tabular-nums font-medium">
                  {formatUsd(plan.minInvestmentCents)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/40">Projected APY</dt>
                <dd className="tabular-nums text-emerald-400">
                  {(plan.apyMinBps / 100).toFixed(1)}–{(plan.apyMaxBps / 100).toFixed(1)}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/40">Lock-up</dt>
                <dd>{plan.lockupDays} days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/40">Assets</dt>
                <dd className="text-right text-xs">
                  {JSON.parse(plan.acceptedAssets).join(", ")}
                </dd>
              </div>
            </dl>
            <Link href="/register" className="mt-6 block">
              <Button className="w-full" variant={i === 1 ? "primary" : "secondary"}>
                Invest in {plan.name}
              </Button>
            </Link>
          </Card>
        ))}
      </div>

      <Island className="mt-12">
        <IslandHeader>
          <h2 className="text-lg font-semibold">Compare at a glance</h2>
        </IslandHeader>
        <IslandBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-white/40">
                <tr>
                  <th className="pb-3 pr-4">Plan</th>
                  <th className="pb-3 pr-4">Min</th>
                  <th className="pb-3 pr-4">APY range</th>
                  <th className="pb-3 pr-4">Lock-up</th>
                  <th className="pb-3">Risk</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p: any) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="py-3 pr-4 font-medium">{p.name}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatUsd(p.minInvestmentCents)}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-emerald-400">
                      {(p.apyMinBps / 100).toFixed(1)}–{(p.apyMaxBps / 100).toFixed(1)}%
                    </td>
                    <td className="py-3 pr-4">{p.lockupDays}d</td>
                    <td className="py-3 capitalize">{p.riskTier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </IslandBody>
      </Island>

      <div className="mt-12">
        <RoiCalculator plans={plans.map((p: any) => ({
          id: p.id,
          name: p.name,
          apyMidBps: Math.round((p.apyMinBps + p.apyMaxBps) / 2),
          minInvestmentCents: p.minInvestmentCents,
        }))} />
      </div>

      <div className="mt-8">
        <InvestmentDisclaimer />
      </div>
    </div>
  );
}
