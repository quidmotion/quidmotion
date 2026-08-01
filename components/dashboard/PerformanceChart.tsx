"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { formatUsd } from "@/lib/money";

export function PerformanceChart({
  series,
  investmentsCents,
}: {
  series: { asOf: string; valueCents: number }[];
  investmentsCents: number;
}) {
  const data = series.map((p) => ({
    t: new Date(p.asOf).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    value: p.valueCents / 100,
    raw: p.valueCents,
  }));

  return (
    <Island>
      <IslandHeader>
        <div>
          <div className="text-xs uppercase tracking-wide text-white/40">
            Investments
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {formatUsd(investmentsCents)}
          </div>
        </div>
        <span className="text-xs text-white/35">Portfolio performance</span>
      </IslandHeader>
      <IslandBody>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="perf" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis hide domain={["dataMin - 100", "dataMax + 100"]} />
              <Tooltip
                contentStyle={{
                  background: "rgba(22,24,32,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                }}
                labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                formatter={(v: number) => [
                  formatUsd(Math.round(v * 100)),
                  "Portfolio",
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="url(#perf)"
                fill="url(#perfFill)"
                strokeWidth={2.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </IslandBody>
    </Island>
  );
}
