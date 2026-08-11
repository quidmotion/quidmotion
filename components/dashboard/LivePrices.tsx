"use client";

import { useEffect, useState } from "react";

type Price = {
  asset: string;
  priceUsdCents: number;
  asOf: string;
  source?: string;
};

export function LivePrices({ initial }: { initial?: Price[] }) {
  const [prices, setPrices] = useState<Price[]>(initial ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/prices");
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) {
          setPrices(data.prices);
          setError(null);
        } else setError(data.error ?? "Failed");
      } catch {
        if (!cancelled) setError("Price feed offline");
      }
    }
    // Server already provided prices — skip immediate duplicate /api/prices hit.
    // Refresh on the interval only.
    const id = setInterval(tick, 60_000);
    if (!initial?.length) void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [initial?.length]);

  if (!prices.length && error) {
    return <p className="text-xs text-red-400">{error}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {prices.map((p) => (
        <div
          key={p.asset}
          className="rounded-xl border border-white/8 bg-white/5 px-3 py-2"
        >
          <div className="text-[10px] uppercase tracking-wide text-white/40">
            {p.asset}
          </div>
          <div className="tabular-nums text-sm font-medium text-emerald-300">
            $
            {(p.priceUsdCents / 100).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits:
                p.asset === "USDT" || p.asset === "USDC" ? 4 : 2,
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
