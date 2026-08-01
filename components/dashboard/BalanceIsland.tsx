"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Island, IslandBody } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils/cn";

const RANGES = ["1D", "7D", "6M", "YTD", "1Y", "All"] as const;

export function BalanceIsland({
  totalCents,
  deltaCents,
  deltaPct,
  range,
  onRangeChange,
}: {
  totalCents: number;
  deltaCents: number;
  deltaPct: number;
  range: string;
  onRangeChange?: (r: string) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const positive = deltaCents >= 0;

  return (
    <Island>
      <IslandBody className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-white/40">
              Total Balance
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                {hidden ? "••••••" : formatUsd(totalCents)}
              </span>
              <button
                type="button"
                onClick={() => setHidden((h) => !h)}
                className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
                aria-label={hidden ? "Show balance" : "Hide balance"}
              >
                {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <Badge tone={positive ? "success" : "danger"}>
                {positive ? "+" : ""}
                {formatUsd(deltaCents)} ({positive ? "+" : ""}
                {deltaPct.toFixed(2)}%)
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 rounded-full bg-white/5 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange?.(r)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition",
                  range === r
                    ? "bg-white/15 text-white"
                    : "text-white/45 hover:text-white",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </IslandBody>
    </Island>
  );
}
