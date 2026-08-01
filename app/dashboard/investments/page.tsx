export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import {
  listUserInvestments,
  listPlans,
  getPortfolioSummary,
} from "@/lib/services/investments";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { RiskCallout } from "@/components/shared/InvestmentDisclaimer";
import { SubscribeForm } from "@/components/dashboard/SubscribeForm";
import { LockupSelector } from "@/components/dashboard/LockupSelector";
import { updateLockup } from "@/lib/actions/lockup";

export default async function InvestmentsPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");
  const inv = listUserInvestments(session.user.id, session.user.id);
  const plans = listPlans();
  const summary = getPortfolioSummary(session.user.id, session.user.id);
  const planById = Object.fromEntries(plans.map((p: any) => [p.id, p]));

  async function changeLockupAction(formData: FormData) {
    "use server";
    const s = await getAuth().getSession();
    if (!s) redirect("/login");
    const lockupDays = Number(formData.get("lockupDays"));
    const validLockup = lockupDays as 90 | 180 | 365;
    await updateLockup(s.user.id, validLockup);
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Investments</h1>
        <p className="text-sm text-white/45">
          Active positions with automatic portfolio growth. Only invested
          principal earns yield; lock-up tier sets your share of default APY.
        </p>
      </div>

      <RiskCallout />

      <Island>
        <IslandHeader>
          <span className="font-medium">Default portfolio growth</span>
          <Badge tone="accent">
            {summary.growth.defaultApyPct > 0
              ? `${summary.growth.defaultApyPct.toFixed(2)}% APY`
              : "Invest ≥ $500 to unlock"}
          </Badge>
        </IslandHeader>
        <IslandBody className="space-y-2 text-sm text-white/55">
          <p>
            Total invested:{" "}
            <strong className="text-white tabular-nums">
              {formatUsd(summary.investedCents)}
            </strong>
            {" · "}ROI to date:{" "}
            <strong className="text-emerald-300 tabular-nums">
              {formatUsd(summary.roiToDateCents)}
            </strong>
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {summary.growth.tiers.map((t: any) => (
              <div
                key={t.tier}
                className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs"
              >
                <div className="text-white/40">
                  ${t.minUsd.toLocaleString()}
                  {t.maxUsd != null ? ` – $${t.maxUsd.toLocaleString()}` : "+"}
                </div>
                <div className="mt-1 font-medium text-emerald-300">
                  {t.currentApyPct.toFixed(2)}%{" "}
                  <span className="font-normal text-white/35">({t.band})</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/35">
            Lock-up: 90d → 33% · 180d → 66% · 365d → 100% of default APY. Rates
            re-roll randomly within band every hour.
          </p>
        </IslandBody>
      </Island>

      <div className="grid gap-4 lg:grid-cols-2">
        <Island>
          <IslandHeader>
            <span className="font-medium">Your positions</span>
          </IslandHeader>
          <IslandBody className="space-y-2">
            <LockupSelector
              currentLockupDays={session.user.lockupDays ?? 90}
              changeLockupAction={changeLockupAction}
            />

            {inv.length === 0 && (
              <p className="pt-2 text-sm text-white/40">No investments yet.</p>
            )}
            {inv.map((i: any) => {
              const plan = planById[i.planId];
              return (
                <div
                  key={i.id}
                  className="rounded-xl border border-white/8 bg-white/5 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium tabular-nums">
                      {formatUsd(i.principalCents)}
                    </span>
                    <Badge
                      tone={i.status === "active" ? "success" : "neutral"}
                    >
                      {i.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-white/40">
                    {plan?.name ?? "Plan"} · {session.user.lockupDays ?? 90}-day lock-up
                    {i.effectiveApyBps != null
                      ? ` · ${(i.effectiveApyBps / 100).toFixed(2)}% effective APY`
                      : ""}
                  </div>
                  <div className="mt-1 text-xs text-white/40">
                    ROI to date {formatUsd(i.roiToDateCents)} · matures{" "}
                    {i.maturesAt.slice(0, 10)}
                  </div>
                </div>
              );
            })}
          </IslandBody>
        </Island>

        <Island>
          <IslandHeader>
            <span className="font-medium">Subscribe to a plan</span>
          </IslandHeader>
          <IslandBody>
            {session.user.kycStatus !== "approved" && (
              <p className="mb-3 text-sm text-amber-300/90">
                KYC must be approved before investing.{" "}
                <Link href="/dashboard/settings" className="underline">
                  Go to settings
                </Link>
              </p>
            )}
            <SubscribeForm plans={plans} />
          </IslandBody>
        </Island>
      </div>
    </div>
  );
}
