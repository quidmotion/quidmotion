"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/money";

export function PortfolioChart({
  data,
}: {
  data: { asOf: string; valueCents: number }[];
}) {
  const chartData = data.map((d) => ({
    date: d.asOf.slice(5, 10),
    value: d.valueCents / 100,
    raw: d.valueCents,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-white/40">
        No performance data yet
      </div>
    );
  }

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="qmGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <linearGradient id="qmFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis hide domain={["dataMin - 100", "dataMax + 100"]} />
          <Tooltip
            contentStyle={{
              background: "rgba(22,24,32,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value: number) => [formatUsd(value * 100), "Value"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="url(#qmGrad)"
            strokeWidth={2.5}
            fill="url(#qmFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
