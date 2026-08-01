import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ledgerEntries, userBalances } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { Cents } from "@/lib/money";

export type LedgerType =
  | "deposit"
  | "subscribe"
  | "withdraw"
  | "payout"
  | "refund"
  | "referral_reward"
  | "adjustment"
  | "yield";

function nowIso() {
  return new Date().toISOString();
}

export function ensureBalanceRow(userId: string) {
  const db = getDb();
  const existing = db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))
    .get();
  if (!existing) {
    db.insert(userBalances)
      .values({
        userId,
        availableCents: 0,
        lockedCents: 0,
        updatedAt: nowIso(),
      })
      .run();
  }
}

export function getBalances(userId: string) {
  ensureBalanceRow(userId);
  const db = getDb();
  return db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))
    .get()!;
}

/**
 * Append ledger entry and update materialized balances.
 * amountCents: positive = credit available; negative = debit available.
 * For subscribe: debit available and optionally increase locked.
 */
export function postLedgerEntry(input: {
  userId: string;
  type: LedgerType;
  amountCents: number;
  asset?: string;
  refType?: string;
  refId?: string;
  note?: string;
  lockCents?: number;
}) {
  const db = getDb();
  ensureBalanceRow(input.userId);
  const bal = getBalances(input.userId);
  const nextAvailable = bal.availableCents + input.amountCents;
  const lockDelta = input.lockCents ?? 0;
  const nextLocked = bal.lockedCents + lockDelta;

  if (nextAvailable < 0) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient available balance");
  }
  if (nextLocked < 0) {
    throw new AppError("INSUFFICIENT_BALANCE", "Invalid lock adjustment");
  }

  const id = randomUUID();
  const createdAt = nowIso();
  db.insert(ledgerEntries)
    .values({
      id,
      userId: input.userId,
      type: input.type,
      amountCents: input.amountCents,
      asset: input.asset ?? "USD",
      refType: input.refType,
      refId: input.refId,
      note: input.note,
      createdAt,
    })
    .run();

  db.update(userBalances)
    .set({
      availableCents: nextAvailable,
      lockedCents: nextLocked,
      updatedAt: createdAt,
    })
    .where(eq(userBalances.userId, input.userId))
    .run();

  return { id, availableCents: nextAvailable as Cents, lockedCents: nextLocked as Cents };
}
