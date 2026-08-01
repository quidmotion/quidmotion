import "server-only";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  investmentPlans,
  userInvestments,
  portfolioValueSnapshots,
  transactions,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { formatUsd } from "@/lib/money";
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
  resolveDefaultApyBps,
  totalActiveInvestedCents,
} from "./growth";

import type { InferSelectModel } from "drizzle-orm";

export type TimeRange = "1D" | "7D" | "6M" | "YTD" | "1Y" | "All";
export type InvestmentPlan = InferSelectModel<typeof investmentPlans>;

export function listPlans(activeOnly = true): InvestmentPlan[] {
  const db = getDb();
  const rows = db.select().from(investmentPlans).all() as InvestmentPlan[];
  return activeOnly ? rows.filter((p) => p.status === "active") : rows;
}

export function getPlan(planIdOrSlug: string) {
  const db = getDb();
  return (
    db
      .select()
      .from(investmentPlans)
      .where(eq(investmentPlans.id, planIdOrSlug))
      .get() ??
    db
      .select()
      .from(investmentPlans)
      .where(eq(investmentPlans.slug, planIdOrSlug))
      .get()
  );
}

export function listUserInvestments(actorId: string, userId: string) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  // Accrue growth lazily when viewing investments
  accrueUserGrowth(userId);
  const db = getDb();
  return db
    .select()
    .from(userInvestments)
    .where(eq(userInvestments.userId, userId))
    .orderBy(desc(userInvestments.createdAt))
    .all();
}

export async function subscribe(
  actorId: string,
  input: { planId: string; amountCents: number; propertyId?: string },
) {
  const actor = loadActor(actorId);
  assertActive(actor);
  assertKycApproved(actor);

  if (input.amountCents <= 0) {
    throw new AppError("VALIDATION", "Amount must be positive");
  }

  const plan = getPlan(input.planId);
  if (!plan || plan.status !== "active") {
    throw new AppError("NOT_FOUND", "Plan not found", 404);
  }
  if (input.amountCents < plan.minInvestmentCents) {
    throw new AppError(
      "VALIDATION",
      `Minimum investment is ${formatUsd(plan.minInvestmentCents)}`,
    );
  }

  const bal = getBalances(actor.id);
  if (bal.availableCents < input.amountCents) {
    throw new AppError("INSUFFICIENT_BALANCE", "Deposit more funds first");
  }

  const db = getDb();
  const id = randomUUID();
  const startedAt = new Date();
  const maturesAt = new Date(
    startedAt.getTime() + plan.lockupDays * 24 * 60 * 60 * 1000,
  );
  const createdAt = startedAt.toISOString();

  // Project effective APY after this subscription
  const projectedTotal =
    totalActiveInvestedCents(actor.id) + input.amountCents;
  const defaultApy = resolveDefaultApyBps(projectedTotal);
  const effectiveApyBps = Math.round(
    defaultApy * lockupMultiplier(plan.lockupDays),
  );

  postLedgerEntry({
    userId: actor.id,
    type: "subscribe",
    amountCents: -input.amountCents,
    lockCents: input.amountCents,
    refType: "investment",
    refId: id,
    note: `Subscribe ${plan.name}`,
  });

  db.insert(userInvestments)
    .values({
      id,
      userId: actor.id,
      planId: plan.id,
      propertyId: input.propertyId,
      principalCents: input.amountCents,
      status: "active",
      startedAt: createdAt,
      maturesAt: maturesAt.toISOString(),
      roiToDateCents: 0,
      lastAccruedAt: createdAt,
      effectiveApyBps,
      createdAt,
    })
    .run();

  db.insert(transactions)
    .values({
      id: randomUUID(),
      userId: actor.id,
      type: "invest",
      amountCents: input.amountCents,
      asset: "USD",
      status: "confirmed",
      txRef: id,
      createdAt,
    })
    .run();

  logEvent({
    actorId: actor.id,
    action: "investment.subscribe",
    resourceType: "investment",
    resourceId: id,
    meta: { planId: plan.id, amountCents: input.amountCents, effectiveApyBps },
  });

  await notifyInvestmentCreated(
    actor.id,
    input.amountCents,
    plan.name,
    plan.lockupDays,
  );

  return db.select().from(userInvestments).where(eq(userInvestments.id, id)).get()!;
}

export function getPortfolioSummary(actorId: string, userId: string) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);

  // Live growth accrual before summarizing
  const growth = accrueUserGrowth(userId);
  const growthInfo = describeGrowthForUser(userId);

  const bal = getBalances(userId);
  const investments = listUserInvestments(actorId, userId);
  const activePrincipal = investments
    .filter((i) => i.status === "active" || i.status === "maturing")
    .reduce((s, i) => s + i.principalCents, 0);
  const roi = investments.reduce((s, i) => s + i.roiToDateCents, 0);
  // Available already includes credited yield; locked is principal
  const totalValueCents = bal.availableCents + bal.lockedCents;
  const series = getPerformanceSeries(actorId, userId, "7D");
  const first = series[0]?.valueCents ?? totalValueCents;
  const last = series[series.length - 1]?.valueCents ?? totalValueCents;
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
    series: getPerformanceSeries(actorId, userId, "1Y"),
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

export function getPerformanceSeries(
  actorId: string,
  userId: string,
  range: TimeRange = "1Y",
) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  const all = db
    .select()
    .from(portfolioValueSnapshots)
    .where(eq(portfolioValueSnapshots.userId, userId))
    .orderBy(portfolioValueSnapshots.asOf)
    .all();

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
  const filtered = all.filter((s) => new Date(s.asOf).getTime() >= cut);
  return filtered.map((s) => ({
    asOf: s.asOf,
    valueCents: s.valueCents,
  }));
}

export function projectRoi(
  amountCents: number,
  years: number,
  apyBps: number,
): number {
  const apy = apyBps / 10000;
  return Math.round(amountCents * Math.pow(1 + apy, years));
}
