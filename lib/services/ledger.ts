import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ledgerEntries, userBalances } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { asCents, sumCents, warnIfInsaneCents, type Cents } from "@/lib/money";

export type LedgerType =
  | "deposit"
  | "subscribe"
  | "withdraw"
  | "payout"
  | "refund"
  | "referral_reward"
  | "adjustment"
  | "yield"
  | "transfer_out"
  | "transfer_in";

export type UserBalance = {
  userId?: string;
  availableCents: Cents;
  lockedCents: Cents;
  updatedAt: string;
};

/** Optional Drizzle transaction / alternate executor. */
export type DbExecutor = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeBalance(row: {
  userId?: string;
  availableCents?: unknown;
  lockedCents?: unknown;
  updatedAt?: string;
} | null | undefined): UserBalance {
  const availableCents = asCents(row?.availableCents);
  const lockedCents = asCents(row?.lockedCents);
  warnIfInsaneCents("availableCents", availableCents, { userId: row?.userId });
  warnIfInsaneCents("lockedCents", lockedCents, { userId: row?.userId });
  return {
    userId: row?.userId,
    availableCents,
    lockedCents,
    updatedAt: row?.updatedAt ?? nowIso(),
  };
}

export async function ensureBalanceRow(
  userId: string,
  executor?: DbExecutor,
) {
  const db = executor ?? getDb();
  const rows = (await db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))) as any[];
  if (!rows[0]) {
    await db.insert(userBalances).values({
      userId,
      availableCents: 0,
      lockedCents: 0,
      updatedAt: nowIso(),
    });
  }
}

export async function getBalances(
  userId: string,
  executor?: DbExecutor,
): Promise<UserBalance> {
  await ensureBalanceRow(userId, executor);
  const db = executor ?? getDb();
  const rows = (await db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))) as any[];
  return normalizeBalance(rows[0] ?? { availableCents: 0, lockedCents: 0 });
}

/**
 * Append ledger entry and update materialized balances.
 * amountCents: positive = credit available; negative = debit available.
 * For subscribe: debit available and optionally increase locked.
 * Pass `executor` to participate in an outer DB transaction.
 */
export async function postLedgerEntry(input: {
  userId: string;
  type: LedgerType;
  amountCents: number;
  asset?: string;
  refType?: string;
  refId?: string;
  note?: string;
  lockCents?: number;
  executor?: DbExecutor;
}) {
  const db = input.executor ?? getDb();
  await ensureBalanceRow(input.userId, db);
  const bal = await getBalances(input.userId, db);
  const amountCents = asCents(input.amountCents);
  const lockDelta = asCents(input.lockCents ?? 0);
  const nextAvailable = sumCents(bal.availableCents, amountCents);
  const nextLocked = sumCents(bal.lockedCents, lockDelta);

  if (nextAvailable < 0) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient available balance");
  }
  if (nextLocked < 0) {
    throw new AppError("INSUFFICIENT_BALANCE", "Invalid lock adjustment");
  }

  warnIfInsaneCents("postLedger.nextAvailable", nextAvailable, {
    userId: input.userId,
    type: input.type,
  });
  warnIfInsaneCents("postLedger.nextLocked", nextLocked, {
    userId: input.userId,
    type: input.type,
  });

  const id = randomUUID();
  const createdAt = nowIso();
  await db.insert(ledgerEntries).values({
    id,
    userId: input.userId,
    type: input.type,
    amountCents,
    asset: input.asset ?? "USD",
    refType: input.refType,
    refId: input.refId,
    note: input.note,
    createdAt,
  });

  await db
    .update(userBalances)
    .set({
      availableCents: nextAvailable,
      lockedCents: nextLocked,
      updatedAt: createdAt,
    })
    .where(eq(userBalances.userId, input.userId));

  return {
    id,
    availableCents: nextAvailable,
    lockedCents: nextLocked,
  };
}

/** Run work inside a DB transaction when the adapter supports it. */
export async function withDbTransaction<T>(
  fn: (executor: DbExecutor) => Promise<T>,
): Promise<T> {
  const db = getDb() as any;
  if (typeof db.transaction === "function") {
    return db.transaction(async (tx: DbExecutor) => fn(tx));
  }
  return fn(db);
}
