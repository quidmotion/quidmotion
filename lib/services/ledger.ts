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

export async function ensureBalanceRow(userId: string) {
  const db = getDb();
  const rows = (await db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))) as any[];
  if (!rows[0]) {
    await db.insert(userBalances)
      .values({
        userId,
        availableCents: 0,
        lockedCents: 0,
        updatedAt: nowIso(),
      });
  }
}

export async function getBalances(userId: string) {
  await ensureBalanceRow(userId);
  const db = getDb();
  const rows = (await db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))) as any[];
  return rows[0] || { availableCents: 0, lockedCents: 0, updatedAt: nowIso() };
}

/**
 * Append ledger entry and update materialized balances.
 * amountCents: positive = credit available; negative = debit available.
 * For subscribe: debit available and optionally increase locked.
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
}) {
  const db = getDb();
  await ensureBalanceRow(input.userId);
  const bal = await getBalances(input.userId);
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
  await db.insert(ledgerEntries)
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
    });

  await db.update(userBalances)
    .set({
      availableCents: nextAvailable,
      lockedCents: nextLocked,
      updatedAt: createdAt,
    })
    .where(eq(userBalances.userId, input.userId));

  return { id, availableCents: nextAvailable as Cents, lockedCents: nextLocked as Cents };
}
