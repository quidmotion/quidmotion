import "server-only";
import { randomUUID } from "node:crypto";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { payouts, transactions, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  assertActive,
  assertAdmin,
  assertKycApproved,
  assertSelfOrAdmin,
  loadActor,
} from "./_authz";
import { postLedgerEntry, getBalances } from "./ledger";
import {
  notifyWithdrawalRequested,
  notifyWithdrawalCompleted,
} from "./email";
import { logEvent } from "./audit";

function nowIso() {
  return new Date().toISOString();
}

export function listUpcoming(actorId: string, userId: string) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  return db
    .select()
    .from(payouts)
    .where(
      and(
        eq(payouts.userId, userId),
        inArray(payouts.status, [
          "scheduled",
          "pending_approval",
          "processing",
        ]),
      ),
    )
    .orderBy(desc(payouts.createdAt))
    .all();
}

export function listUserPayouts(actorId: string, userId: string) {
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  return db
    .select()
    .from(payouts)
    .where(eq(payouts.userId, userId))
    .orderBy(desc(payouts.createdAt))
    .all();
}

export type WithdrawalRequestInput = {
  amountCents: number;
  withdrawalAddress: string;
  asset?: string;
  network?: string;
};

/**
 * KYC-approved users only. Funds leave available balance immediately;
 * status starts as pending_approval until admin reviews.
 */
export async function requestWithdrawal(
  actorId: string,
  input: WithdrawalRequestInput,
) {
  const actor = loadActor(actorId);
  assertActive(actor);
  assertKycApproved(actor);

  const amountCents = input.amountCents;
  if (amountCents <= 0) throw new AppError("VALIDATION", "Invalid amount");
  if (amountCents < 1000) {
    throw new AppError("VALIDATION", "Minimum withdrawal is $10.00");
  }

  const address = input.withdrawalAddress?.trim();
  if (!address || address.length < 8) {
    throw new AppError(
      "VALIDATION",
      "A valid withdrawal address is required",
    );
  }

  const bal = getBalances(actor.id);
  if (bal.availableCents < amountCents) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient available balance");
  }

  const asset = (input.asset ?? "USDT").toUpperCase();
  const network = input.network?.trim() || (asset === "BTC" ? "Bitcoin" : "Ethereum");

  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();

  postLedgerEntry({
    userId: actor.id,
    type: "withdraw",
    amountCents: -amountCents,
    refType: "payout",
    refId: id,
    note: "Withdrawal request",
  });

  db.insert(payouts)
    .values({
      id,
      userId: actor.id,
      payoutType: "withdrawal",
      amountCents,
      status: "pending_approval",
      withdrawalAddress: address,
      withdrawalAsset: asset,
      withdrawalNetwork: network,
      createdAt,
    })
    .run();

  db.insert(transactions)
    .values({
      id: randomUUID(),
      userId: actor.id,
      type: "withdraw",
      amountCents,
      asset,
      status: "pending",
      txRef: id,
      meta: JSON.stringify({ address, network }),
      createdAt,
    })
    .run();

  logEvent({
    actorId: actor.id,
    action: "withdrawal.request",
    resourceType: "payout",
    resourceId: id,
    meta: { amountCents, address, asset },
  });

  await notifyWithdrawalRequested(actor.id, amountCents, address);

  return db.select().from(payouts).where(eq(payouts.id, id)).get()!;
}

export function listPendingApprovals(actorId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return db
    .select()
    .from(payouts)
    .where(eq(payouts.status, "pending_approval"))
    .orderBy(desc(payouts.createdAt))
    .all();
}

/** Approved / in-flight withdrawals awaiting manual on-chain send + completion. */
export function listProcessing(actorId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return db
    .select()
    .from(payouts)
    .where(eq(payouts.status, "processing"))
    .orderBy(desc(payouts.createdAt))
    .all();
}

export function listAdminWithdrawals(actorId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const rows = db
    .select()
    .from(payouts)
    .where(eq(payouts.payoutType, "withdrawal"))
    .orderBy(desc(payouts.createdAt))
    .all();

  return rows.map((p: any) => {
    const user = db.select().from(users).where(eq(users.id, p.userId)).get();
    return {
      ...p,
      userEmail: user?.email,
      userName: user?.name,
    };
  });
}

export function approve(actorId: string, payoutId: string) {
  return approvePayout(actorId, payoutId);
}

export function reject(actorId: string, payoutId: string, note?: string) {
  return rejectPayout(actorId, payoutId, note);
}

/**
 * Admin approves → status becomes "processing".
 * Admin then manually sends crypto to withdrawal_address and marks completed.
 */
export function approvePayout(actorId: string, payoutId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const row = db.select().from(payouts).where(eq(payouts.id, payoutId)).get();
  if (!row) throw new AppError("NOT_FOUND", "Payout not found", 404);
  if (row.status !== "pending_approval") {
    throw new AppError("INVALID_STATE", `Cannot approve from ${row.status}`);
  }
  if (!row.withdrawalAddress) {
    throw new AppError(
      "INVALID_STATE",
      "Withdrawal address missing — cannot approve",
    );
  }
  const now = nowIso();
  db.update(payouts)
    .set({
      status: "processing",
      reviewedBy: actor.id,
      reviewedAt: now,
    })
    .where(eq(payouts.id, payoutId))
    .run();

  logEvent({
    actorId: actor.id,
    action: "withdrawal.approve",
    resourceType: "payout",
    resourceId: payoutId,
  });

  return db.select().from(payouts).where(eq(payouts.id, payoutId)).get()!;
}

export function rejectPayout(actorId: string, payoutId: string, note?: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const row = db.select().from(payouts).where(eq(payouts.id, payoutId)).get();
  if (!row) throw new AppError("NOT_FOUND", "Payout not found", 404);
  if (row.status !== "pending_approval" && row.status !== "processing") {
    throw new AppError("INVALID_STATE", `Cannot reject from ${row.status}`);
  }
  // Refund available balance
  postLedgerEntry({
    userId: row.userId,
    type: "refund",
    amountCents: row.amountCents,
    refType: "payout",
    refId: row.id,
    note: note ?? "Withdrawal rejected — funds restored",
  });
  const now = nowIso();
  db.update(payouts)
    .set({
      status: "rejected",
      reviewedBy: actor.id,
      reviewedAt: now,
      note,
    })
    .where(eq(payouts.id, payoutId))
    .run();

  // Mark related tx failed
  const txs = db
    .select()
    .from(transactions)
    .where(eq(transactions.txRef, payoutId))
    .all();
  for (const t of txs) {
    db.update(transactions)
      .set({ status: "failed" })
      .where(eq(transactions.id, t.id))
      .run();
  }

  logEvent({
    actorId: actor.id,
    action: "withdrawal.reject",
    resourceType: "payout",
    resourceId: payoutId,
    meta: { note },
  });

  return db.select().from(payouts).where(eq(payouts.id, payoutId)).get()!;
}

/**
 * After admin has manually deposited to the user's withdrawal address,
 * mark the payout completed and notify the user.
 */
export async function completePayout(
  actorId: string,
  payoutId: string,
  note?: string,
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const row = db.select().from(payouts).where(eq(payouts.id, payoutId)).get();
  if (!row) throw new AppError("NOT_FOUND", "Payout not found", 404);
  if (row.status !== "processing") {
    throw new AppError(
      "INVALID_STATE",
      `Only processing withdrawals can be completed (current: ${row.status})`,
    );
  }
  const now = nowIso();
  db.update(payouts)
    .set({
      status: "completed",
      completedAt: now,
      note: note ?? row.note,
    })
    .where(eq(payouts.id, payoutId))
    .run();

  const txs = db
    .select()
    .from(transactions)
    .where(eq(transactions.txRef, payoutId))
    .all();
  for (const t of txs) {
    db.update(transactions)
      .set({ status: "confirmed" })
      .where(eq(transactions.id, t.id))
      .run();
  }

  logEvent({
    actorId: actor.id,
    action: "withdrawal.complete",
    resourceType: "payout",
    resourceId: payoutId,
  });

  await notifyWithdrawalCompleted(
    row.userId,
    row.amountCents,
    row.withdrawalAddress ?? "",
  );

  return db.select().from(payouts).where(eq(payouts.id, payoutId)).get()!;
}
