import "server-only";
import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  defaultPortfolioRates,
  userInvestments,
  investmentPlans,
  portfolioValueSnapshots,
  userBalances,
  users,
  platformSettings,
} from "@/lib/db/schema";
import { getBalances } from "./ledger";
import { assertAdmin, loadActor } from "./_authz";
import { setSetting } from "./settings";

/** Hours in a year for continuous hourly compounding approximation. */
const HOURS_PER_YEAR = 365 * 24;

/** Fetch dynamic Lock-up → share of Default Portfolio Growth APY. */
export function getLockupMultipliers(): Record<number, number> {
  const db = getDb();
  const m90 = db.select().from(platformSettings).where(eq(platformSettings.key, "lockup_mult_90")).get();
  const m180 = db.select().from(platformSettings).where(eq(platformSettings.key, "lockup_mult_180")).get();
  const m365 = db.select().from(platformSettings).where(eq(platformSettings.key, "lockup_mult_365")).get();

  return {
    90: m90 ? Number(m90.value) : 0.33,
    180: m180 ? Number(m180.value) : 0.66,
    365: m365 ? Number(m365.value) : 1.0,
  };
}

export function lockupMultiplier(lockupDays: number): number {
  const mults = getLockupMultipliers();
  if (mults[lockupDays] !== undefined) {
    return mults[lockupDays];
  }
  if (lockupDays <= 90) return mults[90];
  if (lockupDays <= 180) return mults[180];
  return mults[365];
}

function nowIso() {
  return new Date().toISOString();
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Refresh default portfolio APY for each size tier (random within band).
 * Call once per hour (cron or lazy check).
 */
export function refreshDefaultPortfolioRates(force = false) {
  const db = getDb();
  const rows = db.select().from(defaultPortfolioRates).all();
  const now = Date.now();
  const updated: typeof rows = [];

  for (const row of rows) {
    const ageMs = now - new Date(row.updatedAt).getTime();
    const stale = force || ageMs >= 60 * 60 * 1000;
    if (!stale) {
      updated.push(row);
      continue;
    }
    const next = randomInt(row.apyMinBps, row.apyMaxBps);
    const ts = nowIso();
    db.update(defaultPortfolioRates)
      .set({ currentApyBps: next, updatedAt: ts })
      .where(eq(defaultPortfolioRates.tier, row.tier))
      .run();
    updated.push({ ...row, currentApyBps: next, updatedAt: ts });
  }
  return updated;
}

export function listDefaultPortfolioRates() {
  refreshDefaultPortfolioRates(false);
  return getDb().select().from(defaultPortfolioRates).all();
}

/**
 * Resolve Default Portfolio Growth APY (bps) from total invested principal.
 * Tiers:
 *  - >= $500  and < $2,500  → 20–25%
 *  - >= $2,500 and < $10,000 → 45–50%
 *  - >= $10,000              → 60–70%
 * Below $500: no growth (0).
 */
export function resolveDefaultApyBps(totalInvestedCents: number): number {
  const rates = listDefaultPortfolioRates();
  if (totalInvestedCents < 50_000) return 0;

  // Prefer exact tier match by min/max
  const sorted = [...rates].sort(
    (a, b) => b.minInvestedCents - a.minInvestedCents,
  );
  for (const t of sorted) {
    if (totalInvestedCents < t.minInvestedCents) continue;
    if (t.maxInvestedCents != null && totalInvestedCents >= t.maxInvestedCents) {
      continue;
    }
    return t.currentApyBps;
  }
  // Fallback: highest tier if above all mins
  const top = sorted[0];
  return top?.currentApyBps ?? 0;
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
  return inv.reduce((s: number, i: any) => s + i.principalCents, 0);
}

/**
 * Accrue hourly growth on each active investment.
 * Only invested principal is eligible. Effective APY = default tier APY × lock-up multiplier.
 * Yield is added to available cash (realized growth) and tracked on roiToDateCents.
 */
export async function accrueUserGrowth(userId: string) {
  refreshDefaultPortfolioRates(false);
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
    return { accruedCents: 0, investments: [] as { id: string; yieldCents: number; effectiveApyBps: number }[] };
  }

  const totalInvested = investments.reduce((s: number, i: any) => s + i.principalCents, 0);
  const defaultApyBps = resolveDefaultApyBps(totalInvested);
  const now = Date.now();
  let totalYield = 0;
  const details: { id: string; yieldCents: number; effectiveApyBps: number }[] = [];

  const userRows = (await db.select().from(users).where(eq(users.id, userId))) as any[];
  const userRow = userRows[0];
  const userLockupDays = userRow?.lockupDays ?? 90;
  const mult = lockupMultiplier(userLockupDays);
  const effectiveApyBps = Math.round(defaultApyBps * mult);

  for (const inv of investments) {

    const last = inv.lastAccruedAt
      ? new Date(inv.lastAccruedAt).getTime()
      : new Date(inv.startedAt).getTime();
    const elapsedMs = Math.max(0, now - last);
    const hours = elapsedMs / (60 * 60 * 1000);

    // Accrue only whole hours to keep deterministic / avoid float spam
    const wholeHours = Math.floor(hours);
    if (wholeHours <= 0 || effectiveApyBps <= 0) {
      // Still stamp effective APY for UI
      if (inv.effectiveApyBps !== effectiveApyBps) {
        await db.update(userInvestments)
          .set({ effectiveApyBps })
          .where(eq(userInvestments.id, inv.id));
      }
      details.push({ id: inv.id, yieldCents: 0, effectiveApyBps });
      continue;
    }

    const apy = effectiveApyBps / 10000;
    const yieldCents = Math.floor(
      inv.principalCents * apy * (wholeHours / HOURS_PER_YEAR),
    );

    const accruedAt = new Date(last + wholeHours * 60 * 60 * 1000).toISOString();

    await db.update(userInvestments)
      .set({
        roiToDateCents: inv.roiToDateCents + yieldCents,
        lastAccruedAt: accruedAt,
        effectiveApyBps,
      })
      .where(eq(userInvestments.id, inv.id));

    if (yieldCents > 0) {
      // Credit yield to available balance (growth is withdrawable after credit)
      const bal = await getBalances(userId);
      await db.update(userBalances)
        .set({
          availableCents: bal.availableCents + yieldCents,
          updatedAt: nowIso(),
        })
        .where(eq(userBalances.userId, userId));
      totalYield += yieldCents;
    }

    details.push({ id: inv.id, yieldCents, effectiveApyBps });
  }

  // Snapshot portfolio value after accrual
  const bal = await getBalances(userId);
  const freshInv = (await db
    .select()
    .from(userInvestments)
    .where(eq(userInvestments.userId, userId))) as any[];
  const roi = freshInv.reduce((s: number, i: any) => s + i.roiToDateCents, 0);
  // Portfolio = available + locked principal (roi already moved to available)
  const valueCents = bal.availableCents + bal.lockedCents;
  void roi;
  await db.insert(portfolioValueSnapshots)
    .values({
      id: randomUUID(),
      userId,
      asOf: nowIso(),
      valueCents,
    });

  return { accruedCents: totalYield, investments: details, defaultApyBps };
}

/** Accrue growth for every user with active investments (hourly job). */
export async function accrueAllUsersGrowth() {
  refreshDefaultPortfolioRates(true);
  const db = getDb();
  const all = (await db
    .select({ userId: userInvestments.userId })
    .from(userInvestments)
    .where(inArray(userInvestments.status, ["active", "maturing"]))) as any[];
  const unique = [...new Set(all.map((r: any) => r.userId as string))];
  const results = await Promise.all((unique as string[]).map(async (userId: string) => ({
    userId,
    ...(await accrueUserGrowth(userId)),
  })));
  return {
    usersProcessed: unique.length,
    totalYieldCents: results.reduce((s: number, r: any) => s + r.accruedCents, 0),
    results,
  };
}

export async function describeGrowthForUser(userId: string) {
  const totalInvested = await totalActiveInvestedCents(userId);
  const defaultApyBps = resolveDefaultApyBps(totalInvested);
  const rates = listDefaultPortfolioRates();
  const mults = getLockupMultipliers();
  return {
    totalInvestedCents: totalInvested,
    defaultApyBps,
    defaultApyPct: defaultApyBps / 100,
    tiers: rates.map((r: any) => ({
      tier: r.tier,
      minUsd: r.minInvestedCents / 100,
      maxUsd: r.maxInvestedCents != null ? r.maxInvestedCents / 100 : null,
      currentApyPct: r.currentApyBps / 100,
      band: `${r.apyMinBps / 100}–${r.apyMaxBps / 100}%`,
      updatedAt: r.updatedAt,
    })),
    lockupMultipliers: [
      { days: 90, multiplier: mults[90], label: `${Math.round(mults[90] * 100)}% of default APY` },
      { days: 180, multiplier: mults[180], label: `${Math.round(mults[180] * 100)}% of default APY` },
      { days: 365, multiplier: mults[365], label: `${Math.round(mults[365] * 100)}% of default APY` },
    ],
  };
}

export function recalculateAllInvestmentsApy() {
  const db = getDb();
  const activeUsers = db
    .select({ userId: userInvestments.userId })
    .from(userInvestments)
    .where(inArray(userInvestments.status, ["active", "maturing"]))
    .all();
  const uniqueUserIds = [...new Set(activeUsers.map((u: any) => u.userId as string))];
  for (const uid of uniqueUserIds as string[]) {
    accrueUserGrowth(uid);
  }
}

export function updateApyRules(
  actorId: string,
  tiers: { tier: string; currentApyPct: number; minApyPct: number; maxApyPct: number }[],
  lockups: { days: number; multiplierPct: number }[],
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const now = nowIso();

  for (const t of tiers) {
    const currentApyBps = Math.round(t.currentApyPct * 100);
    const apyMinBps = Math.round(t.minApyPct * 100);
    const apyMaxBps = Math.round(t.maxApyPct * 100);
    db.update(defaultPortfolioRates)
      .set({ currentApyBps, apyMinBps, apyMaxBps, updatedAt: now })
      .where(eq(defaultPortfolioRates.tier, t.tier))
      .run();
  }

  for (const l of lockups) {
    const key = `lockup_mult_${l.days}`;
    const value = String(l.multiplierPct / 100);
    setSetting(actorId, key, value);
  }

  recalculateAllInvestmentsApy();
}
