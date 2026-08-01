import "server-only";
import { randomUUID } from "node:crypto";
import { eq, desc, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions, priceSnapshots, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { features } from "@/lib/config/features";
import {
  assertActive,
  assertAdmin,
  assertSelfOrAdmin,
  loadActor,
} from "./_authz";
import { postLedgerEntry } from "./ledger";
import { getDepositWallets, DEPOSIT_ASSETS } from "./settings";
import {
  notifyDepositConfirmed,
  notifyDepositRequested,
} from "./email";
import { logEvent } from "./audit";
import { createNotification } from "./notifications";

/** Fallback prices when live feed is unavailable. priceUsdCents = round(USD * 100). */
const SAFE_FALLBACK: Record<string, number> = {
  USDT: 100, // $1.00
  USDC: 100,
  BTC: 9_500_000, // $95,000.00
  ETH: 350_000, // $3,500.00
};

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
};

function nowIso() {
  return new Date().toISOString();
}

function cachePrices(rows: { asset: string; priceUsdCents: number; asOf: string }[]) {
  const db = getDb();
  for (const r of rows) {
    db.insert(priceSnapshots)
      .values({
        id: randomUUID(),
        asset: r.asset,
        priceUsdCents: r.priceUsdCents,
        asOf: r.asOf,
      })
      .run();
  }
}

/** Fetch live USD prices from CoinGecko (no API key required for basic). */
export async function fetchLivePrices(): Promise<
  { asset: string; priceUsdCents: number; asOf: string; source: "live" | "fallback" }[]
> {
  const asOf = nowIso();
  const useLive =
    features.liveCryptoPrices || features.priceSource === "live";

  if (!useLive) {
    return Object.entries(SAFE_FALLBACK).map(([asset, priceUsdCents]) => ({
      asset,
      priceUsdCents,
      asOf,
      source: "fallback" as const,
    }));
  }

  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const res = await fetch(url, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const rows = Object.entries(COINGECKO_IDS).map(([asset, id]) => {
      const usd = data[id]?.usd;
      const priceUsdCents =
        usd != null && Number.isFinite(usd)
          ? Math.round(usd * 100)
          : SAFE_FALLBACK[asset];
      return {
        asset,
        priceUsdCents,
        asOf,
        source: "live" as const,
      };
    });
    cachePrices(rows);
    return rows;
  } catch (e) {
    console.warn("[prices] live fetch failed, using cache/fallback", e);
    const cached = listCachedLatestPrices();
    if (cached.length) {
      return cached.map((c: any) => ({
        asset: c.asset,
        priceUsdCents: c.priceUsdCents,
        asOf: c.asOf,
        source: "fallback" as const,
      }));
    }
    return Object.entries(SAFE_FALLBACK).map(([asset, priceUsdCents]) => ({
      asset,
      priceUsdCents,
      asOf,
      source: "fallback" as const,
    }));
  }
}

function listCachedLatestPrices() {
  const db = getDb();
  const all = db
    .select()
    .from(priceSnapshots)
    .orderBy(desc(priceSnapshots.asOf))
    .all();
  const latest = new Map<string, (typeof all)[0]>();
  for (const row of all) {
    if (!latest.has(row.asset)) latest.set(row.asset, row);
  }
  return [...latest.values()];
}

export async function getPrices() {
  // Prefer fresh live; fall back to latest cache if fetched recently (<2 min)
  const cached = listCachedLatestPrices();
  const freshEnough =
    cached.length >= 4 &&
    cached.every(
      (c) => Date.now() - new Date(c.asOf).getTime() < 2 * 60 * 1000,
    );
  if (freshEnough) {
    return cached.map((c: any) => ({
      asset: c.asset,
      priceUsdCents: c.priceUsdCents,
      asOf: c.asOf,
      source: "cache" as const,
    }));
  }
  return fetchLivePrices();
}

/** @deprecated use getPrices */
export function getMockPrices() {
  return Object.entries(SAFE_FALLBACK).map(([asset, priceUsdCents]) => ({
    asset,
    priceUsdCents,
    asOf: nowIso(),
  }));
}

export function listSupportedAssets() {
  return DEPOSIT_ASSETS.map((symbol: any) => ({
    symbol,
    primary: symbol === "USDT" || symbol === "USDC",
  }));
}

export function getDepositAddress(_userId: string | null, asset = "USDT") {
  const key = asset.toUpperCase();
  const wallets = getDepositWallets();
  const row = wallets.find((w: any) => w.asset === key);
  if (!row || !row.address) {
    throw new AppError(
      "VALIDATION",
      `Deposit address for ${key} is not configured. Contact support.`,
    );
  }
  return {
    asset: key,
    address: row.address,
    network: row.network,
    note: "Send only the selected asset on the stated network. Incorrect transfers may be unrecoverable.",
  };
}

export function getAllDepositAddresses() {
  return getDepositWallets().map((w: any) => ({
    asset: w.asset,
    address: w.address,
    network: w.network,
  }));
}

/** Convert crypto units to USD cents using latest known prices. */
export function toUsdCents(asset: string, units: number): number {
  const key = asset.toUpperCase();
  const cached = listCachedLatestPrices().find((p: any) => p.asset === key);
  const price = cached?.priceUsdCents ?? SAFE_FALLBACK[key];
  if (!price) throw new AppError("VALIDATION", `Unsupported asset: ${asset}`);
  if (key === "USDT" || key === "USDC") {
    // units interpreted as USD dollars for stables
    return Math.round(units * 100);
  }
  return Math.round(units * price);
}

/**
 * User reports a deposit after sending funds to the platform wallet.
 * Creates a pending transaction only — balance is credited after admin confirmation.
 * (On-chain watchers / third-party rails can replace the admin step later.)
 */
export async function requestDeposit(
  actorId: string,
  input: { asset: string; amountUsd: number; txRef?: string },
) {
  const actor = loadActor(actorId);
  assertActive(actor);

  const asset = input.asset.toUpperCase();
  if (!DEPOSIT_ASSETS.includes(asset as (typeof DEPOSIT_ASSETS)[number])) {
    throw new AppError("VALIDATION", `Unsupported asset: ${asset}`);
  }
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new AppError("VALIDATION", "Amount must be positive");
  }

  const wallet = getDepositAddress(actor.id, asset);

  const amountCents = Math.round(input.amountUsd * 100);
  if (amountCents < 1000) {
    throw new AppError("VALIDATION", "Minimum deposit is $10.00");
  }

  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();
  const txRef = input.txRef?.trim() || `dep_${id.slice(0, 8)}`;

  db.insert(transactions)
    .values({
      id,
      userId: actor.id,
      type: "deposit",
      amountCents,
      asset,
      status: "pending",
      txRef,
      meta: JSON.stringify({
        source: "user_report",
        network: wallet.network,
        platformAddress: wallet.address,
      }),
      createdAt,
    })
    .run();

  logEvent({
    actorId: actor.id,
    action: "deposit.request",
    resourceType: "transaction",
    resourceId: id,
    meta: { amountCents, asset, txRef },
  });

  createNotification({
    userId: actor.id,
    title: "Deposit submitted",
    body: `Your ${asset} deposit is pending admin confirmation.`,
    kind: "deposit",
  });

  await notifyDepositRequested(actor.id, amountCents, asset, txRef);

  return db.select().from(transactions).where(eq(transactions.id, id)).get()!;
}

/** @deprecated use requestDeposit — no longer auto-credits */
export async function confirmDeposit(
  actorId: string,
  input: { asset: string; amountUsd: number; txRef?: string },
) {
  return requestDeposit(actorId, input);
}

/** @deprecated alias */
export function simulateDepositConfirm(
  actorId: string,
  input: { asset: string; units: number },
) {
  return requestDeposit(actorId, {
    asset: input.asset,
    amountUsd: input.units,
  });
}

export function listUserDeposits(actorId: string, userId: string) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  return db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), eq(transactions.type, "deposit")),
    )
    .orderBy(desc(transactions.createdAt))
    .all();
}

export function listPendingDeposits(actorId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const rows = db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.type, "deposit"), eq(transactions.status, "pending")),
    )
    .orderBy(desc(transactions.createdAt))
    .all();

  return rows.map((t: any) => {
    const user = db.select().from(users).where(eq(users.id, t.userId)).get();
    let meta: Record<string, unknown> = {};
    try {
      meta = t.meta ? JSON.parse(t.meta) : {};
    } catch {
      meta = {};
    }
    return {
      ...t,
      userEmail: user?.email,
      userName: user?.name,
      meta,
    };
  });
}

export function listAdminDeposits(actorId: string, limit = 50) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const rows = db
    .select()
    .from(transactions)
    .where(eq(transactions.type, "deposit"))
    .orderBy(desc(transactions.createdAt))
    .all()
    .slice(0, limit);

  return rows.map((t: any) => {
    const user = db.select().from(users).where(eq(users.id, t.userId)).get();
    return {
      ...t,
      userEmail: user?.email,
      userName: user?.name,
    };
  });
}

/**
 * Admin confirms on-chain receipt and credits the user's available balance.
 */
export async function adminConfirmDeposit(
  actorId: string,
  transactionId: string,
  note?: string,
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const row = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .get();
  if (!row) throw new AppError("NOT_FOUND", "Deposit not found", 404);
  if (row.type !== "deposit") {
    throw new AppError("INVALID_STATE", "Not a deposit transaction");
  }
  if (row.status !== "pending") {
    throw new AppError(
      "INVALID_STATE",
      `Cannot confirm deposit in status ${row.status}`,
    );
  }

  postLedgerEntry({
    userId: row.userId,
    type: "deposit",
    amountCents: row.amountCents,
    asset: row.asset,
    refType: "transaction",
    refId: row.id,
    note: note?.trim() || `Admin-confirmed deposit ${row.asset} · ${row.txRef}`,
  });

  let meta: Record<string, unknown> = {};
  try {
    meta = row.meta ? JSON.parse(row.meta) : {};
  } catch {
    meta = {};
  }
  meta.confirmedBy = actor.id;
  meta.confirmedAt = nowIso();
  if (note?.trim()) meta.adminNote = note.trim();

  db.update(transactions)
    .set({
      status: "confirmed",
      meta: JSON.stringify(meta),
    })
    .where(eq(transactions.id, transactionId))
    .run();

  logEvent({
    actorId: actor.id,
    action: "deposit.admin_confirm",
    resourceType: "transaction",
    resourceId: transactionId,
    meta: { userId: row.userId, amountCents: row.amountCents, asset: row.asset },
  });

  createNotification({
    userId: row.userId,
    title: "Deposit credited",
    body: `Your ${row.asset} deposit has been confirmed and credited.`,
    kind: "deposit",
  });

  await notifyDepositConfirmed(row.userId, row.amountCents, row.asset);

  return db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .get()!;
}

/** Admin rejects a pending deposit (no balance change — nothing was credited). */
export async function adminRejectDeposit(
  actorId: string,
  transactionId: string,
  note?: string,
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const row = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .get();
  if (!row) throw new AppError("NOT_FOUND", "Deposit not found", 404);
  if (row.type !== "deposit" || row.status !== "pending") {
    throw new AppError(
      "INVALID_STATE",
      `Cannot reject deposit in status ${row.status}`,
    );
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = row.meta ? JSON.parse(row.meta) : {};
  } catch {
    meta = {};
  }
  meta.rejectedBy = actor.id;
  meta.rejectedAt = nowIso();
  if (note?.trim()) meta.adminNote = note.trim();

  db.update(transactions)
    .set({
      status: "failed",
      meta: JSON.stringify(meta),
    })
    .where(eq(transactions.id, transactionId))
    .run();

  logEvent({
    actorId: actor.id,
    action: "deposit.admin_reject",
    resourceType: "transaction",
    resourceId: transactionId,
    meta: { note },
  });

  createNotification({
    userId: row.userId,
    title: "Deposit not confirmed",
    body:
      note?.trim() ||
      "Your deposit report was not confirmed. Contact support if you already sent funds.",
    kind: "deposit",
  });

  return db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .get()!;
}

export function listRecentPrices() {
  const cached = listCachedLatestPrices();
  if (cached.length) return cached;
  return getMockPrices().map((p: any) => ({
    id: p.asset,
    asset: p.asset,
    priceUsdCents: p.priceUsdCents,
    asOf: p.asOf,
  }));
}

export async function adminRefreshPrices(actorId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  return fetchLivePrices();
}


