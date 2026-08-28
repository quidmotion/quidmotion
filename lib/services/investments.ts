import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { eq, desc, and, gte } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  defaultPortfolioRates,
  investmentPlans,
  userInvestments,
  portfolioValueSnapshots,
  transactions,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { asCents, formatUsd, sumCents } from "@/lib/money";
import {
  assertSelfOrAdmin,
  assertKycApproved,
  assertActive,
  loadActor,
} from "./_authz";
import { getBalances, postLedgerEntry } from "./ledger";
import { notifyInvestmentCreated } from "./email";
import { logEvent } from "./audit";
import {
  accrueUserGrowth,
  describeGrowthForUser,
  lockupMultiplier,
  projectedPlanApy,
  resolveDefaultApyBps,
  totalActiveInvestedCents,
} from "./growth";

export type TimeRange = "1D" | "7D" | "6M" | "YTD" | "1Y" | "All";
export type InvestmentPlan = InferSelectModel<typeof investmentPlans>;

async function withLivePlanApy(
  plans: InvestmentPlan[],
): Promise<InvestmentPlan[]> {
  if (plans.length === 0) return plans;
  const db = getDb();
  const rateRows = (await db.select().from(defaultPortfolioRates)) as any[];
  return plans.map((p) => {
    const apy = projectedPlanApy(p, rateRows);
    return { ...p, apyMinBps: apy.apyMinBps, apyMaxBps: apy.apyMaxBps };
  });
}

const listPlansCached = cache(
  async (mode: "active" | "all"): Promise<InvestmentPlan[]> => {
    const db = getDb();
    const rows =
      mode === "active"
        ? ((await db
            .select()
            .from(investmentPlans)
            .where(eq(investmentPlans.status, "active"))) as InvestmentPlan[])
        : ((await db.select().from(investmentPlans)) as InvestmentPlan[]);
    return withLivePlanApy(rows);
  },
);

/** Request-memoized plan list (shared across home + investments). */
export function listPlans(activeOnly = true): Promise<InvestmentPlan[]> {
  return listPlansCached(activeOnly ? "active" : "all");
}

export async function getPlan(
  planIdOrSlug: string,
): Promise<InvestmentPlan | undefined> {
  const db = getDb();
  const byId = await db
    .select()
    .from(investmentPlans)
    .where(eq(investmentPlans.id, planIdOrSlug));
  const found = (byId[0] ??
    (
      await db
        .select()
        .from(investmentPlans)
        .where(eq(investmentPlans.slug, planIdOrSlug))
    )[0]) as InvestmentPlan | undefined;
  if (!found) return undefined;
  const [live] = await withLivePlanApy([found]);
  return live;
}

/**
 * List user investments. Accrues growth by default (investments page).
 * Pass skipAccrue when the caller already accrued (e.g. portfolio summary).
 */
export async function listUserInvestments(
  actorId: string,
  userId: string,
  opts?: { skipAccrue?: boolean },
) {
  const actor = await loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  if (!opts?.skipAccrue) {
    await accrueUserGrowth(userId);
  }
  const db = getDb();
  const rows = (await db
    .select()
    .from(userInvestments)
    .where(eq(userInvestments.userId, userId))
    .orderBy(desc(userInvestments.createdAt))) as any[];

  // Normalize cents fields so UI arithmetic never string-concats
  return rows.map((r: any) => ({
    ...r,
    principalCents: asCents(r.principalCents),
    roiToDateCents: asCents(r.roiToDateCents),
    effectiveApyBps:
      r.effectiveApyBps == null ? r.effectiveApyBps : asCents(r.effectiveApyBps),
  }));
}

export async function createInvestment(
  actorId: string,
  input: {
    planId: string;
    propertyId?: string;
    amountCents: number;
  },
) {
  const actor = await loadActor(actorId);
  assertActive(actor);
  assertKycApproved(actor);

  const amountCents = asCents(input.amountCents);
  if (amountCents <= 0) {
    throw new AppError("VALIDATION", "Amount must be positive");
  }

  const plan = await getPlan(input.planId);
  if (!plan || plan.status !== "active") {
    throw new AppError("NOT_FOUND", "Plan not found", 404);
  }
  const minInvest = asCents(plan.minInvestmentCents);
  if (amountCents < minInvest) {
    throw new AppError(
      "VALIDATION",
      `Minimum investment is ${formatUsd(minInvest)}`,
    );
  }

  const bal = await getBalances(actor.id);
  if (bal.availableCents < amountCents) {
    throw new AppError("INSUFFICIENT_BALANCE", "Deposit more funds first");
  }

  const db = getDb();
  const id = randomUUID();
  const startedAt = new Date();
  const lockupDays = asCents(plan.lockupDays) || 90;
  const maturesAt = new Date(
    startedAt.getTime() + lockupDays * 24 * 60 * 60 * 1000,
  );
  const createdAt = startedAt.toISOString();

  // Project effective APY after this subscription (plan lock-up, not user profile)
  const projectedTotal = sumCents(
    await totalActiveInvestedCents(actor.id),
    amountCents,
  );
  const defaultApy = await resolveDefaultApyBps(projectedTotal);
  const effectiveApyBps = Math.round(
    defaultApy * (await lockupMultiplier(lockupDays)),
  );

  await postLedgerEntry({
    userId: actor.id,
    type: "subscribe",
    amountCents: -amountCents,
    lockCents: amountCents,
    refType: "investment",
    refId: id,
    note: `Subscribe ${plan.name}`,
  });

  await db.insert(userInvestments).values({
    id,
    userId: actor.id,
    planId: plan.id,
    propertyId: input.propertyId,
    principalCents: amountCents,
    status: "active",
    startedAt: createdAt,
    maturesAt: maturesAt.toISOString(),
    roiToDateCents: 0,
    lastAccruedAt: createdAt,
    effectiveApyBps,
    createdAt,
  });

  await db.insert(transactions).values({
    id: randomUUID(),
    userId: actor.id,
    type: "invest",
    amountCents,
    asset: "USD",
    status: "confirmed",
    txRef: id,
    createdAt,
  });

  await logEvent({
    actorId: actor.id,
    action: "investment.subscribe",
    resourceType: "investment",
    resourceId: id,
    meta: { planId: plan.id, amountCents, effectiveApyBps },
  });

  await notifyInvestmentCreated(
    actor.id,
    amountCents,
    plan.name,
    lockupDays,
  );

  const createdRows = await db
    .select()
    .from(userInvestments)
    .where(eq(userInvestments.id, id));
  return createdRows[0]!;
}

export async function getPortfolioSummary(actorId: string, userId: string) {
  const actor = await loadActor(actorId);
  assertSelfOrAdmin(actor, userId);

  // Accrue first so balances / investment ROI reflect any newly credited yield.
  // React.cache ensures a second call in this request is a no-op.
  const growth = await accrueUserGrowth(userId);

  // Independent reads can run in parallel after accrual.
  const [growthInfo, bal, investments, series1Y] = await Promise.all([
    describeGrowthForUser(userId),
    getBalances(userId),
    listUserInvestments(actorId, userId, { skipAccrue: true }),
    getPerformanceSeries(actorId, userId, "1Y"),
  ]);

  const activePrincipal = investments
    .filter((i: any) => i.status === "active" || i.status === "maturing")
    .reduce((s: number, i: any) => sumCents(s, i.principalCents), 0);
  const roi = investments.reduce(
    (s: number, i: any) => sumCents(s, i.roiToDateCents),
    0,
  );
  // Available already includes credited yield; locked is principal
  const totalValueCents = sumCents(bal.availableCents, bal.lockedCents);

  // Derive 7D change from the same 1Y series (one snapshot query, not two)
  const cut7D = Date.now() - 7 * 86400000;
  const series7D = series1Y.filter(
    (s) => new Date(s.asOf).getTime() >= cut7D,
  );
  const first = asCents(series7D[0]?.valueCents ?? totalValueCents);
  const last = asCents(
    series7D[series7D.length - 1]?.valueCents ?? totalValueCents,
  );
  const changeCents = last - first;
  const changeBps =
    first > 0 ? Math.round((changeCents / first) * 10000) : 0;

  return {
    totalCents: totalValueCents,
    totalValueCents,
    availableCents: bal.availableCents,
    lockedCents: bal.lockedCents,
    investedCents: activePrincipal,
    roiToDateCents: roi,
    investmentCount: investments.length,
    investments,
    series: series1Y,
    changeCents,
    changeBps,
    growth: {
      lastAccruedCents: growth.accruedCents,
      defaultApyBps: growthInfo.defaultApyBps,
      defaultApyPct: growthInfo.defaultApyPct,
      tiers: growthInfo.tiers,
      lockupMultipliers: growthInfo.lockupMultipliers,
    },
  };
}

export async function getPerformanceSeries(
  actorId: string,
  userId: string,
  range: TimeRange = "1Y",
) {
  const actor = await loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();

  const now = Date.now();
  const cutoffs: Record<TimeRange, number> = {
    "1D": now - 1 * 86400000,
    "7D": now - 7 * 86400000,
    "6M": now - 180 * 86400000,
    YTD: new Date(new Date().getFullYear(), 0, 1).getTime(),
    "1Y": now - 365 * 86400000,
    All: 0,
  };
  const cut = cutoffs[range];

  const rows =
    cut > 0
      ? ((await db
          .select()
          .from(portfolioValueSnapshots)
          .where(
            and(
              eq(portfolioValueSnapshots.userId, userId),
              gte(portfolioValueSnapshots.asOf, new Date(cut).toISOString()),
            ),
          )
          .orderBy(portfolioValueSnapshots.asOf)) as any[])
      : ((await db
          .select()
          .from(portfolioValueSnapshots)
          .where(eq(portfolioValueSnapshots.userId, userId))
          .orderBy(portfolioValueSnapshots.asOf)) as any[]);

  return rows.map((s: any) => ({
    asOf: s.asOf,
    valueCents: asCents(s.valueCents),
  }));
}

export function projectRoi(
  amountCents: number,
  years: number,
  apyBps: number,
): number {
  const apy = asCents(apyBps) / 10000;
  return Math.round(asCents(amountCents) * Math.pow(1 + apy, years));
}
