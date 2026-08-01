"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { formatUsd, toCents } from "@/lib/money";

type PlanOpt = {
  id: string;
  name: string;
  apyMidBps: number;
  minInvestmentCents: number;
};

export function RoiCalculator({ plans }: { plans: PlanOpt[] }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [amount, setAmount] = useState(2500);
  const [years, setYears] = useState(3);

  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const apy = (plan?.apyMidBps ?? 1000) / 10000;

  const data = useMemo(() => {
    const principal = toCents(amount);
    const points = [];
    for (let y = 0; y <= years; y++) {
      const value = Math.round(principal * Math.pow(1 + apy, y));
      points.push({ year: `Y${y}`, valueCents: value, label: formatUsd(value) });
    }
    return points;
  }, [amount, years, apy]);

  const final = data[data.length - 1]?.valueCents ?? 0;

  return (
    <Island>
      <IslandHeader>
        <div>
          <h2 className="text-lg font-semibold">ROI calculator</h2>
          <p className="text-sm text-white/45">Illustrative compound projection</p>
        </div>
      </IslandHeader>
      <IslandBody>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-xs uppercase tracking-wide text-white/40">
              Plan
              <select
                className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900">
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs uppercase tracking-wide text-white/40">
              Amount (USD)
              <input
                type="number"
                min={plan ? plan.minInvestmentCents / 100 : 100}
                className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
              />
            </label>
            <label className="block text-xs uppercase tracking-wide text-white/40">
              Years: {years}
              <input
                type="range"
                min={1}
                max={10}
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                className="mt-2 w-full accent-violet-500"
              />
            </label>
            <div className="rounded-xl bg-white/5 p-4">
              <div className="text-xs uppercase text-white/40">Projected value</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-emerald-400">
                {formatUsd(final)}
              </div>
              <div className="mt-1 text-sm text-white/45">
                Mid APY {(apy * 100).toFixed(1)}% · not guaranteed
              </div>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="roiFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" stroke="#6b6b80" fontSize={12} />
                <YAxis
                  stroke="#6b6b80"
                  fontSize={12}
                  tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#161820",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                  }}
                  formatter={(v: number) => [formatUsd(v), "Value"]}
                />
                <Area
                  type="monotone"
                  dataKey="valueCents"
                  stroke="url(#roiStroke)"
                  strokeWidth={2}
                  fill="url(#roiFill)"
                />
                <defs>
                  <linearGradient id="roiStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </IslandBody>
    </Island>
  );
}
