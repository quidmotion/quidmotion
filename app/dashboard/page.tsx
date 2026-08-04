export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { formatUsd } from "@/lib/money";
import { getPortfolioSummary, listPlans } from "@/lib/services/investments";
import { getBalances } from "@/lib/services/ledger";
import { listUpcoming } from "@/lib/services/payouts";
import { listFeatured } from "@/lib/services/properties";
import { listNotifications } from "@/lib/services/notifications";
import { getRewards } from "@/lib/services/referrals";
import { features } from "@/lib/config/features";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { YieldDonut } from "@/components/dashboard/YieldDonut";
import { Eye, Plus } from "lucide-react";

export default async function DashboardPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");
  const { user } = session;
  const uid = user.id;

  const summary = await getPortfolioSummary(uid, uid);
  const balance = await getBalances(uid);
  const upcoming = await listUpcoming(uid, uid);
  const properties = await listFeatured(6);
  const notes = await listNotifications(uid, uid, 3);
  const plans = (await listPlans()).slice(0, 2);

  let rewards = null;
  if (features.referrals) {
    try {
      rewards = await getRewards(uid, uid);
    } catch {
      rewards = null;
    }
  }

  const firstName = user.name.split(" ")[0];
  const gain = summary.changeCents;
  const gainPct = summary.changeBps / 100;

  // Mix = available + locked only. Yield is already inside available after accrual;
  // adding roiToDateCents on top double-counts.
  const mixSegments = [
    {
      key: "Available cash",
      amountCents: balance.availableCents,
      color: "#22c55e",
    },
    {
      key: "Invested (locked)",
      amountCents: balance.lockedCents,
      color: "#8b5cf6",
    },
  ].filter((s: any) => s.amountCents > 0);
  const mixTotal = mixSegments.reduce(
    (s: number, seg: any) => s + Number(seg.amountCents || 0),
    0,
  );

  return (
    <div className="space-y-3 pb-4 sm:space-y-4 sm:pb-8">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 sm:gap-3 sm:px-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Hi {firstName} 👋
          </h1>
          <p className="text-xs text-white/45 sm:text-sm">
            Welcome back, here&apos;s what&apos;s happening with your portfolio.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/dashboard/deposit">
            <Button size="sm">Deposit</Button>
          </Link>
          <Link
            href="/dashboard/investments"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-lg shadow-violet-500/30 sm:h-10 sm:w-10"
            aria-label="Invest"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Balance + chart column */}
        <div className="space-y-4 lg:col-span-8">
          <Island>
            <IslandBody className="pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/40">
                    Total portfolio
                    <Eye className="h-3.5 w-3.5" />
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl md:text-4xl">
                    {formatUsd(summary.totalValueCents)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={gain >= 0 ? "success" : "danger"}>
                      {gain >= 0 ? "+" : ""}
                      {formatUsd(gain)} ({gainPct >= 0 ? "+" : ""}
                      {gainPct.toFixed(2)}%)
                    </Badge>
                    <span className="text-xs text-white/35">7D</span>
                  </div>
                </div>
                <div className="-mx-1 max-w-full overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0">
                  <div className="flex w-max gap-1 rounded-full bg-white/5 p-1 sm:w-auto sm:flex-wrap">
                    {["1D", "7D", "6M", "YTD", "1Y", "All"].map((t: any) => (
                      <span
                        key={t}
                        className={
                          t === "7D"
                            ? "rounded-full bg-white/15 px-2.5 py-1 text-xs"
                            : "rounded-full px-2.5 py-1 text-xs text-white/45"
                        }
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </IslandBody>
          </Island>

          <Island>
            <IslandHeader>
              <div>
                <div className="text-xs uppercase tracking-wide text-white/40">
                  Investments
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatUsd(summary.investedCents)}
                </div>
              </div>
              <Badge tone="accent">Live chart</Badge>
            </IslandHeader>
            <IslandBody>
              <PortfolioChart data={summary.series} />
            </IslandBody>
          </Island>

          <div className="grid gap-4 sm:grid-cols-2">
            {plans.map((plan: any) => (
              <Island key={plan.id}>
                <IslandBody className="flex h-full flex-col pt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{plan.name}</h3>
                    <Badge tone="neutral">{plan.riskTier}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-white/40">
                    Min {formatUsd(plan.minInvestmentCents)} ·{" "}
                    {(plan.apyMinBps / 100).toFixed(1)}–
                    {(plan.apyMaxBps / 100).toFixed(1)}% APY
                  </p>
                  <div className="mt-4 text-2xl font-semibold tabular-nums">
                    {formatUsd(
                      summary.investments
                        .filter((i: any) => i.planId === plan.id)
                        .reduce((s: any, i: any) => s + i.principalCents, 0),
                    )}
                  </div>
                  <div className="mt-auto flex justify-end pt-4">
                    <Link href="/dashboard/investments">
                      <Button size="sm" variant="secondary">
                        Invest
                      </Button>
                    </Link>
                  </div>
                </IslandBody>
              </Island>
            ))}
            {plans.length === 0 && (
              <Island className="sm:col-span-2">
                <IslandBody className="pt-5 text-sm text-white/50">
                  No plans seeded yet. Run <code>npm run db:seed</code>.
                </IslandBody>
              </Island>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4 lg:col-span-4">
          <Island>
            <IslandBody className="pt-5">
              <div className="text-sm font-medium">Cash available</div>
              <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
                {formatUsd(balance.availableCents)}
              </div>
              <p className="mt-1 text-xs text-white/40">
                Locked in positions: {formatUsd(balance.lockedCents)}
              </p>
              <div className="mt-4 flex gap-2">
                <Link href="/dashboard/deposit" className="flex-1">
                  <Button size="sm" className="w-full">
                    Deposit
                  </Button>
                </Link>
                <Link href="/dashboard/withdraw" className="flex-1">
                  <Button size="sm" variant="secondary" className="w-full">
                    Withdraw
                  </Button>
                </Link>
              </div>
            </IslandBody>
          </Island>

          <Island>
            <IslandHeader>
              <span className="text-sm font-medium">Alerts</span>
              <Link
                href="/dashboard/settings"
                className="text-xs text-violet-300"
              >
                See more
              </Link>
            </IslandHeader>
            <IslandBody className="space-y-2">
              {notes.length === 0 && (
                <p className="text-sm text-white/40">No alerts yet.</p>
              )}
              {notes.map((n: any) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-white/8 bg-white/5 px-3 py-2"
                >
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-white/45">{n.body}</div>
                </div>
              ))}
              {features.referrals && rewards && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-3">
                  <div className="text-sm font-medium">
                    Refer a friend & earn
                  </div>
                  <p className="mt-1 text-xs text-white/50">
                    Code: <strong>{rewards.referralCode}</strong>
                  </p>
                  <Link href="/dashboard/referrals" className="mt-2 inline-block">
                    <Button size="sm" variant="secondary">
                      Get code
                    </Button>
                  </Link>
                </div>
              )}
            </IslandBody>
          </Island>

          <Island>
            <IslandHeader>
              <span className="text-sm font-medium">Portfolio mix</span>
              <Badge tone="accent">Live</Badge>
            </IslandHeader>
            <IslandBody>
              {mixTotal > 0 ? (
                <YieldDonut totalCents={mixTotal} segments={mixSegments} />
              ) : (
                <p className="text-sm text-white/40">
                  Deposit funds to see your portfolio mix.
                </p>
              )}
            </IslandBody>
          </Island>
        </div>

        {/* Bottom row */}
        <Island className="lg:col-span-8">
          <IslandHeader>
            <span className="text-sm font-medium">Featured properties</span>
            <Link
              href="/dashboard/properties"
              className="text-xs text-violet-300"
            >
              View all
            </Link>
          </IslandHeader>
          <IslandBody>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 snap-x snap-mandatory">
              {properties.map((p: any) => (
                <div
                  key={p.id}
                  className="min-w-[min(200px,75vw)] shrink-0 snap-start rounded-xl border border-white/8 bg-white/5 p-3"
                >
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-white/40">{p.location}</div>
                  <div className="mt-2 text-xs text-emerald-400">
                    {(p.expectedApyBps / 100).toFixed(1)}% expected
                  </div>
                  <div className="mt-1 text-xs text-white/35">
                    {formatUsd(p.raisedCents)} / {formatUsd(p.targetRaiseCents)}
                  </div>
                </div>
              ))}
              {properties.length === 0 && (
                <p className="text-sm text-white/40">No live deals yet.</p>
              )}
            </div>
          </IslandBody>
        </Island>

        <Island className="lg:col-span-4">
          <IslandHeader>
            <span className="text-sm font-medium">Upcoming payouts</span>
          </IslandHeader>
          <IslandBody className="space-y-2">
            {upcoming.length === 0 && (
              <p className="text-sm text-white/40">Nothing scheduled.</p>
            )}
            {upcoming.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
              >
                <div>
                  <div className="text-sm capitalize">{p.payoutType}</div>
                  <div className="text-xs text-white/40">{p.status}</div>
                </div>
                <div className="tabular-nums text-sm font-medium">
                  {formatUsd(p.amountCents)}
                </div>
              </div>
            ))}
          </IslandBody>
        </Island>
      </div>
    </div>
  );
}
