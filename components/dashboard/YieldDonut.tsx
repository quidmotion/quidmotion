"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { formatUsd } from "@/lib/money";

export function YieldDonut({
  totalCents,
  segments,
}: {
  totalCents: number;
  segments: { key: string; amountCents: number; color: string }[];
}) {
  const data = segments.map((s) => ({
    name: s.key,
    value: Math.max(s.amountCents, 0),
    color: s.color,
  }));

  return (
    <div>
      <div className="relative mx-auto h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={52}
              outerRadius={70}
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] uppercase tracking-wide text-white/40">
            Total
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {formatUsd(totalCents)}
          </div>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {segments.map((s) => (
          <li
            key={s.key}
            className="flex items-center justify-between text-xs"
          >
            <span className="flex items-center gap-2 text-white/60">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.key}
            </span>
            <span className="tabular-nums text-white/80">
              {formatUsd(s.amountCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
