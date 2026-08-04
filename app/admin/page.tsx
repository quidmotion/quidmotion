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
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Admin overview</h1>
        <p className="text-sm text-white/45">Platform health at a glance.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c: any) => (
          <Link key={c.label} href={c.href} className="min-w-0">
            <Island className="h-full transition hover:border-violet-500/30">
              <IslandBody className="pt-4 sm:pt-5">
                <div className="text-[10px] uppercase leading-tight text-white/40 sm:text-xs">
                  {c.label}
                </div>
                <div className="mt-1 break-all text-lg font-semibold tabular-nums sm:text-2xl">
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
