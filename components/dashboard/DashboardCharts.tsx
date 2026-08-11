"use client";

import dynamic from "next/dynamic";

const PortfolioChartInner = dynamic(
  () =>
    import("@/components/dashboard/PortfolioChart").then(
      (m) => m.PortfolioChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-44 items-center justify-center text-sm text-white/30 sm:h-52">
        Loading chart…
      </div>
    ),
  },
);

const YieldDonutInner = dynamic(
  () =>
    import("@/components/dashboard/YieldDonut").then((m) => m.YieldDonut),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto h-40 w-40 animate-pulse rounded-full bg-white/5" />
    ),
  },
);

export function LazyPortfolioChart({
  data,
}: {
  data: { asOf: string; valueCents: number }[];
}) {
  return <PortfolioChartInner data={data} />;
}

export function LazyYieldDonut({
  totalCents,
  segments,
}: {
  totalCents: number;
  segments: { key: string; amountCents: number; color: string }[];
}) {
  return <YieldDonutInner totalCents={totalCents} segments={segments} />;
}
