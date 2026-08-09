export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAdminOverview } from "@/lib/services/stats";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody } from "@/components/ui/Island";
import { requireStaffContext } from "@/lib/admin/guard";
import { canAccessAdminPath } from "@/lib/admin/nav";
import { countOpenUnreadForStaff } from "@/lib/services/support-chat";

export default async function AdminOverviewPage() {
  const ctx = await requireStaffContext();
  const o = await getAdminOverview();
  let chatUnread = 0;
  try {
    if (canAccessAdminPath(ctx.user.role, ctx.privileges, "/admin/support")) {
      chatUnread = await countOpenUnreadForStaff(ctx.user.id);
    }
  } catch {
    chatUnread = 0;
  }

  const allCards = [
    {
      label: "Total users",
      value: String(o.totalUsers),
      href: "/admin/users",
      adminOnly: true,
    },
    {
      label: "AUM",
      value: formatUsd(o.totalAumCents),
      href: "/admin",
      adminOnly: false,
    },
    {
      label: "Support chat",
      value: chatUnread > 0 ? `${chatUnread} unread` : "Inbox",
      href: "/admin/support",
      adminOnly: false,
    },
    {
      label: "Pending KYC",
      value: String(o.pendingKyc),
      href: "/admin/kyc",
      adminOnly: false,
    },
    {
      label: "Pending deposits",
      value: String(o.pendingDeposits),
      href: "/admin/deposits",
      adminOnly: false,
    },
    {
      label: "Pending withdrawals",
      value: String(o.pendingWithdrawals),
      href: "/admin/payouts",
      adminOnly: false,
    },
  ];

  const cards = allCards.filter((c) => {
    if (c.adminOnly && !ctx.isFullAdmin) return false;
    return canAccessAdminPath(ctx.user.role, ctx.privileges, c.href);
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">
          {ctx.isFullAdmin ? "Admin" : "Support"} overview
        </h1>
        <p className="text-sm text-white/45">
          {ctx.isFullAdmin
            ? "Platform health at a glance."
            : "Your available queues and tools."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
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
