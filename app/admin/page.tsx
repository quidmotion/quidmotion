export const dynamic = "force-dynamic";
import Link from "next/link";
import { getAdminOverview } from "@/lib/services/stats";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody } from "@/components/ui/Island";

export default async function AdminOverviewPage() {
  const o = await getAdminOverview();

  const cards = [
    { label: "Total users", value: String(o.totalUsers), href: "/admin/users" },
    { label: "AUM", value: formatUsd(o.totalAumCents), href: "/admin" },
    {
      label: "Pending KYC",
      value: String(o.pendingKyc),
      href: "/admin/kyc",
    },
    {
      label: "Pending deposits",
      value: String(o.pendingDeposits),
      href: "/admin/deposits",
    },
    {
      label: "Pending withdrawals",
      value: String(o.pendingWithdrawals),
      href: "/admin/payouts",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin overview</h1>
        <p className="text-sm text-white/45">Platform health at a glance.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c: any) => (
          <Link key={c.label} href={c.href}>
            <Island className="h-full transition hover:border-violet-500/30">
              <IslandBody className="pt-5">
                <div className="text-xs uppercase text-white/40">{c.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {c.value}
                </div>
              </IslandBody>
            </Island>
          </Link>
        ))}
      </div>
    </div>
  );
}
