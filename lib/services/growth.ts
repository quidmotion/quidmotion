import "server-only";
import { randomUUID } from "node:crypto";
import { eq, and, inArray, gte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  defaultPortfolioRates,
  userInvestments,
  portfolioValueSnapshots,
  investmentPlans,
  platformSettings,
} from "@/lib/db/schema";
import { asCents, sumCents, warnIfInsaneCents } from "@/lib/money";
import { getBalances, postLedgerEntry } from "./ledger";
import { assertAdmin, loadActor } from "./_authz";
import { setSetting } from "./settings";

/** Hours in a year for simple hourly interest. */
const HOURS_PER_YEAR = 365 * 24;

/** Snapshot at most once per hour per user (stops page-load spam). */
const SNAPSHOT_MIN_INTERVAL_MS = 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseMultiplier(raw: unknown, fallback: number): number {
  const n = raw != null ? Number(raw) : fallback;
  if (!Number.isFinite(n) || n <= 0 || n > 1) return fallback;
  return n;
}

/** Fetch dynamic Lock-up → share of Default Portfolio Growth APY. */
export async function getLockupMultipliers(): Promise<Record<number, number>> {
  const db = getDb();
  const m90Rows = (await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "lockup_mult_90"))) as any[];
  const m180Rows = (await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "lockup_mult_180"))) as any[];
  const m365Rows = (await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "lockup_mult_365"))) as any[];

  return {
    90: parseMultiplier(m90Rows[0]?.value, 0.33),
    180: parseMultiplier(m180Rows[0]?.value, 0.66),
    365: parseMultiplier(m365Rows[0]?.value, 1.0),
  };
}

export async function lockupMultiplier(lockupDays: number): Promise<number> {
  const mults = await getLockupMultipliers();
  if (mults[lockupDays] !== undefined) {
    return mults[lockupDays];
  }
  if (lockupDays <= 90) return mults[90];
  if (lockupDays <= 180) return mults[180];
  return mults[365];
}

/**
 * Refresh default portfolio APY for each size tier (random within band).
 * Call once per hour (cron or lazy check).
 */
export async function refreshDefaultPortfolioRates(force = false) {
  const db = getDb();
  const rows = (await db.select().from(defaultPortfolioRates)) as any[];
  const now = Date.now();
  const updated: typeof rows = [];

  for (const row of rows) {
    const ageMs = now - new Date(row.updatedAt).getTime();
    const stale = force || ageMs >= 60 * 60 * 1000;
    if (!stale) {
      updated.push(row);
      continue;
    }
    const minBps = asCents(row.apyMinBps);
    const maxBps = asCents(row.apyMaxBps);
    const next = randomInt(minBps, maxBps);
    const ts = nowIso();
    await db
      .update(defaultPortfolioRates)
      .set({ currentApyBps: next, updatedAt: ts })
      .where(eq(defaultPortfolioRates.tier, row.tier));
    updated.push({ ...row, currentApyBps: next, updatedAt: ts });
  }
  return updated;
}

export async function listDefaultPortfolioRates() {
  await refreshDefaultPortfolioRates(false);
  return (await getDb().select().from(defaultPortfolioRates)) as any[];
}

/**
 * Resolve Default Portfolio Growth APY (bps) from total invested principal.
 * Tiers:
 *  - >= $500  and < $2,500  → 20–25%
 *  - >= $2,500 and < $10,000 → 45–50%
 *  - >= $10,000              → 60–70%
 * Below $500: no growth (0).
 */
export async function resolveDefaultApyBps(
  totalInvestedCents: number,
): Promise<number> {
  const rates = await listDefaultPortfolioRates();
  const total = asCents(totalInvestedCents);
  if (total < 50_000) return 0;

  const sorted = [...rates].sort(
    (a, b) => asCents(b.minInvestedCents) - asCents(a.minInvestedCents),
  );
  for (const t of sorted) {
    if (total < asCents(t.minInvestedCents)) continue;
    if (
      t.maxInvestedCents != null &&
      total >= asCents(t.maxInvestedCents)
    ) {
      continue;
    }
    return asCents(t.currentApyBps);
  }
  const top = sorted[0];
  return top ? asCents(top.currentApyBps) : 0;
}

export async function totalActiveInvestedCents(userId: string): Promise<number> {
  const db = getDb();
  const inv = (await db
    .select()
    .from(userInvestments)
    .where(
      and(
        eq(userInvestments.userId, userId),
        inArray(userInvestments.status, ["active", "maturing"]),
      ),
    )) as any[];
  return inv.reduce(
    (s: number, i: any) => sumCents(s, i.principalCents),
    0,
  );
}

async function planLockupDaysByPlanId(
  planIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (planIds.length === 0) return map;
  const db = getDb();
  const unique = [...new Set(planIds)];
  const plans = (await db
    .select()
    .from(investmentPlans)
    .where(inArray(investmentPlans.id, unique))) as any[];
  for (const p of plans) {
    map.set(p.id, asCents(p.lockupDays) || 90);
  }
  return map;
}

/**
 * Accrue hourly growth on each active investment.
 * Only invested principal is eligible.
 * Effective APY = default tier APY × **plan** lock-up multiplier (not user profile).
 * Yield is credited via ledger type "yield" (available cash) and tracked on roiToDateCents.
 */
export async function accrueUserGrowth(userId: string) {
  await refreshDefaultPortfolioRates(false);
  const db = getDb();
  const investments = (await db
    .select()
    .from(userInvestments)
    .where(
      and(
        eq(userInvestments.userId, userId),
        inArray(userInvestments.status, ["active", "maturing"]),
      ),
    )) as any[];

  if (investments.length === 0) {
    return {
      accruedCents: 0,
      investments: [] as {
        id: string;
        yieldCents: number;
        effectiveApyBps: number;
      }[],
      defaultApyBps: 0,
    };
  }

  const totalInvested = investments.reduce(
    (s: number, i: any) => sumCents(s, i.principalCents),
    0,
  );
  const defaultApyBps = await resolveDefaultApyBps(totalInvested);
  const planLockups = await planLockupDaysByPlanId(
    investments.map((i: any) => i.planId as string),
  );
  const multCache = new Map<number, number>();
  async function multFor(days: number) {
    if (!multCache.has(days)) {
      multCache.set(days, await lockupMultiplier(days));
    }
    return multCache.get(days)!;
  }

  const now = Date.now();
  let totalYield = 0;
  const details: {
    id: string;
    yieldCents: number;
    effectiveApyBps: number;
  }[] = [];

  for (const inv of investments) {
    const principal = asCents(inv.principalCents);
    const roiToDate = asCents(inv.roiToDateCents);
    warnIfInsaneCents("investment.principalCents", principal, {
      userId,
      investmentId: inv.id,
    });
    warnIfInsaneCents("investment.roiToDateCents", roiToDate, {
      userId,
      investmentId: inv.id,
    });

    const planDays = planLockups.get(inv.planId) ?? 90;
    const mult = await multFor(planDays);
    const effectiveApyBps = Math.round(defaultApyBps * mult);

    const last = inv.lastAccruedAt
      ? new Date(inv.lastAccruedAt).getTime()
      : new Date(inv.startedAt).getTime();
    const elapsedMs = Math.max(0, now - last);
    const hours = elapsedMs / (60 * 60 * 1000);

    // Accrue only whole hours to keep deterministic / avoid float spam
    const wholeHours = Math.floor(hours);
    if (wholeHours <= 0 || effectiveApyBps <= 0) {
      if (asCents(inv.effectiveApyBps) !== effectiveApyBps) {
        await db
          .update(userInvestments)
          .set({ effectiveApyBps })
          .where(eq(userInvestments.id, inv.id));
      }
      details.push({ id: inv.id, yieldCents: 0, effectiveApyBps });
      continue;
    }

    const apy = effectiveApyBps / 10000;
    const yieldCents = Math.floor(
      principal * apy * (wholeHours / HOURS_PER_YEAR),
    );

    const accruedAt = new Date(
      last + wholeHours * 60 * 60 * 1000,
    ).toISOString();

    await db
      .update(userInvestments)
      .set({
        roiToDateCents: sumCents(roiToDate, yieldCents),
        lastAccruedAt: accruedAt,
        effectiveApyBps,
      })
      .where(eq(userInvestments.id, inv.id));

    if (yieldCents > 0) {
      // Credit yield once via ledger (updates available balance)
      await postLedgerEntry({
        userId,
        type: "yield",
        amountCents: yieldCents,
        refType: "investment",
        refId: inv.id,
        note: `Growth yield (${wholeHours}h @ ${(effectiveApyBps / 100).toFixed(2)}% APY)`,
      });
      totalYield += yieldCents;
    }

    details.push({ id: inv.id, yieldCents, effectiveApyBps });
  }

  await maybeSnapshotPortfolio(userId);

  return { accruedCents: totalYield, investments: details, defaultApyBps };
}

/** Insert portfolio snapshot at most once per hour. */
async function maybeSnapshotPortfolio(userId: string) {
  const db = getDb();
  const cutoff = new Date(Date.now() - SNAPSHOT_MIN_INTERVAL_MS).toISOString();
  const recent = (await db
    .select()
    .from(portfolioValueSnapshots)
    .where(
      and(
        eq(portfolioValueSnapshots.userId, userId),
        gte(portfolioValueSnapshots.asOf, cutoff),
      ),
    )
    .orderBy(desc(portfolioValueSnapshots.asOf))) as any[];

  if (recent.length > 0) return;

  const bal = await getBalances(userId);
  const valueCents = sumCents(bal.availableCents, bal.lockedCents);
  warnIfInsaneCents("snapshot.valueCents", valueCents, { userId });

  await db.insert(portfolioValueSnapshots).values({
    id: randomUUID(),
    userId,
    asOf: nowIso(),
    valueCents,
  });
}

/** Accrue growth for every user with active investments (hourly job). */
export async function accrueAllUsersGrowth() {
  await refreshDefaultPortfolioRates(true);
  const db = getDb();
  const all = (await db
    .select({ userId: userInvestments.userId })
    .from(userInvestments)
    .where(
      inArray(userInvestments.status, ["active", "maturing"]),
    )) as any[];
  const unique = [...new Set(all.map((r: any) => r.userId as string))];
  const results = await Promise.all(
    (unique as string[]).map(async (userId: string) => ({
      userId,
      ...(await accrueUserGrowth(userId)),
    })),
  );
  return {
    usersProcessed: unique.length,
    totalYieldCents: results.reduce(
      (s: number, r: any) => sumCents(s, r.accruedCents),
      0,
    ),
    results,
  };
}

export async function describeGrowthForUser(userId: string) {
  const totalInvested = await totalActiveInvestedCents(userId);
  const defaultApyBps = await resolveDefaultApyBps(totalInvested);
  const rates = await listDefaultPortfolioRates();
  const mults = await getLockupMultipliers();
  return {
    totalInvestedCents: totalInvested,
    defaultApyBps,
    defaultApyPct: defaultApyBps / 100,
    tiers: rates.map((r: any) => ({
      tier: r.tier,
      minUsd: asCents(r.minInvestedCents) / 100,
      maxUsd:
        r.maxInvestedCents != null ? asCents(r.maxInvestedCents) / 100 : null,
      currentApyPct: asCents(r.currentApyBps) / 100,
      band: `${asCents(r.apyMinBps) / 100}–${asCents(r.apyMaxBps) / 100}%`,
      updatedAt: r.updatedAt,
    })),
    lockupMultipliers: [
      {
        days: 90,
        multiplier: mults[90],
        label: `${Math.round(mults[90] * 100)}% of default APY`,
      },
      {
        days: 180,
        multiplier: mults[180],
        label: `${Math.round(mults[180] * 100)}% of default APY`,
      },
      {
        days: 365,
        multiplier: mults[365],
        label: `${Math.round(mults[365] * 100)}% of default APY`,
      },
    ],
  };
}

export async function recalculateAllInvestmentsApy() {
  const db = getDb();
  const activeUsers = (await db
    .select({ userId: userInvestments.userId })
    .from(userInvestments)
    .where(
      inArray(userInvestments.status, ["active", "maturing"]),
    )) as any[];
  const uniqueUserIds = [
    ...new Set(activeUsers.map((u: any) => u.userId as string)),
  ];
  for (const uid of uniqueUserIds as string[]) {
    await accrueUserGrowth(uid);
  }
}

export async function updateApyRules(
  actorId: string,
  tiers: {
    tier: string;
    currentApyPct: number;
    minApyPct: number;
    maxApyPct: number;
  }[],
  lockups: { days: number; multiplierPct: number }[],
) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const now = nowIso();

  for (const t of tiers) {
    const currentApyBps = Math.round(t.currentApyPct * 100);
    const apyMinBps = Math.round(t.minApyPct * 100);
    const apyMaxBps = Math.round(t.maxApyPct * 100);
    await db
      .update(defaultPortfolioRates)
      .set({ currentApyBps, apyMinBps, apyMaxBps, updatedAt: now })
      .where(eq(defaultPortfolioRates.tier, t.tier));
  }

  for (const l of lockups) {
    const key = `lockup_mult_${l.days}`;
    const value = String(l.multiplierPct / 100);
    await setSetting(actorId, key, value);
  }

  await recalculateAllInvestmentsApy();
}
