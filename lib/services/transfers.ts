import "server-only";
import { randomUUID } from "node:crypto";
import { desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  internalTransfers,
  transactions,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { asCents } from "@/lib/money";
import {
  assertActive,
  assertKycApproved,
  assertPrivilege,
  assertSelfOrAdmin,
  loadActor,
} from "./_authz";
import { logEvent } from "./audit";
import {
  getBalances,
  postLedgerEntry,
  withDbTransaction,
} from "./ledger";
import {
  notifyTransferPending,
  notifyTransferReceived,
  notifyTransferRejected,
  notifyTransferSent,
} from "./email";

function nowIso() {
  return new Date().toISOString();
}

const MIN_TRANSFER_CENTS = 100; // $1.00

export type TransferInput = {
  toEmail: string;
  amountCents: number;
  note?: string;
};

async function loadUsersByIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, { id: string; email: string; name: string }>();
  if (unique.length === 0) return map;
  const db = getDb();
  const rows = (await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.id, unique))) as any[];
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

/**
 * Request an available-balance transfer. Sender must be KYC-approved.
 * Funds leave the sender immediately; recipient is credited only after
 * admin approval.
 */
export async function transferAvailableBalance(
  actorId: string,
  input: TransferInput,
) {
  const actor = await loadActor(actorId);
  assertActive(actor);
  assertKycApproved(actor);

  const amountCents = asCents(input.amountCents);
  if (amountCents <= 0) {
    throw new AppError("VALIDATION", "Invalid transfer amount");
  }
  if (amountCents < MIN_TRANSFER_CENTS) {
    throw new AppError("VALIDATION", "Minimum transfer is $1.00");
  }

  const toEmail = input.toEmail?.trim().toLowerCase();
  if (!toEmail || !toEmail.includes("@")) {
    throw new AppError("VALIDATION", "A valid recipient email is required");
  }

  const note = input.note?.trim().slice(0, 200) || undefined;

  const db = getDb();
  const recipientRows = (await db
    .select()
    .from(users)
    .where(eq(users.email, toEmail))) as any[];
  const recipient = recipientRows[0];
  if (!recipient) {
    throw new AppError("NOT_FOUND", "No user found with that email", 404);
  }
  if (recipient.id === actor.id) {
    throw new AppError("VALIDATION", "You cannot transfer to yourself");
  }
  if (recipient.status === "suspended") {
    throw new AppError("FORBIDDEN", "Recipient account is suspended", 403);
  }
  if (recipient.kycStatus !== "approved") {
    throw new AppError(
      "KYC_REQUIRED",
      "Recipient must complete KYC before receiving transfers",
      403,
    );
  }

  const bal = await getBalances(actor.id);
  if (bal.availableCents < amountCents) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient available balance");
  }

  const transferId = randomUUID();
  const createdAt = nowIso();
  const senderTxId = randomUUID();

  await withDbTransaction(async (tx) => {
    await tx.insert(internalTransfers).values({
      id: transferId,
      fromUserId: actor.id,
      toUserId: recipient.id,
      amountCents,
      note: note ?? null,
      status: "pending_approval",
      createdAt,
    });

    await postLedgerEntry({
      userId: actor.id,
      type: "transfer_out",
      amountCents: -amountCents,
      asset: "USD",
      refType: "internal_transfer",
      refId: transferId,
      note: note
        ? `Transfer to ${recipient.email}: ${note}`
        : `Transfer to ${recipient.email}`,
      executor: tx,
    });

    await tx.insert(transactions).values({
      id: senderTxId,
      userId: actor.id,
      type: "transfer",
      amountCents: -amountCents,
      asset: "USD",
      status: "pending",
      txRef: transferId,
      meta: JSON.stringify({
        direction: "out",
        counterpartyUserId: recipient.id,
        counterpartyEmail: recipient.email,
        note: note ?? null,
      }),
      createdAt,
    });
  });

  await logEvent({
    actorId: actor.id,
    action: "transfer.request",
    resourceType: "internal_transfer",
    resourceId: transferId,
    meta: {
      toUserId: recipient.id,
      toEmail: recipient.email,
      amountCents,
    },
  });

  try {
    await notifyTransferPending(
      actor.id,
      amountCents,
      recipient.email,
      recipient.name,
    );
  } catch (e) {
    console.warn("[transfer] notify pending failed", e);
  }

  const rows = (await db
    .select()
    .from(internalTransfers)
    .where(eq(internalTransfers.id, transferId))) as any[];
  return rows[0]!;
}

export async function listUserTransfers(actorId: string, userId: string) {
  const actor = await loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  return (await db
    .select()
    .from(internalTransfers)
    .where(
      or(
        eq(internalTransfers.fromUserId, userId),
        eq(internalTransfers.toUserId, userId),
      ),
    )
    .orderBy(desc(internalTransfers.createdAt))) as any[];
}

export async function listSentTransfers(actorId: string, userId: string) {
  const actor = await loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  return (await db
    .select()
    .from(internalTransfers)
    .where(eq(internalTransfers.fromUserId, userId))
    .orderBy(desc(internalTransfers.createdAt))) as any[];
}

export async function listAdminTransfers(actorId: string) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "transfers.view");
  const db = getDb();
  const rows = (await db
    .select()
    .from(internalTransfers)
    .orderBy(desc(internalTransfers.createdAt))) as any[];

  const userMap = await loadUsersByIds(
    rows.flatMap((t: any) => [t.fromUserId, t.toUserId]),
  );

  return rows.map((t: any) => {
    const from = userMap.get(t.fromUserId);
    const to = userMap.get(t.toUserId);
    return {
      ...t,
      fromEmail: from?.email,
      fromName: from?.name,
      toEmail: to?.email,
      toName: to?.name,
    };
  });
}

export async function countPendingTransfers(): Promise<number> {
  const db = getDb();
  const rows = (await db
    .select()
    .from(internalTransfers)
    .where(eq(internalTransfers.status, "pending_approval"))) as any[];
  return rows.length;
}

async function loadTransferOrThrow(transferId: string) {
  const db = getDb();
  const rows = (await db
    .select()
    .from(internalTransfers)
    .where(eq(internalTransfers.id, transferId))) as any[];
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Transfer not found", 404);
  return row;
}

async function markSenderTx(
  transferId: string,
  status: "confirmed" | "failed",
) {
  const db = getDb();
  const txs = (await db
    .select()
    .from(transactions)
    .where(eq(transactions.txRef, transferId))) as any[];
  for (const t of txs) {
    await db
      .update(transactions)
      .set({ status })
      .where(eq(transactions.id, t.id));
  }
}

/**
 * Admin approves a pending transfer: credit the recipient and confirm both legs.
 */
export async function approveTransfer(actorId: string, transferId: string) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "transfers.review");

  const row = await loadTransferOrThrow(transferId);
  if (row.status !== "pending_approval") {
    throw new AppError("INVALID_STATE", `Cannot approve from ${row.status}`);
  }

  const db = getDb();
  const userMap = await loadUsersByIds([row.fromUserId, row.toUserId]);
  const sender = userMap.get(row.fromUserId);
  const recipient = userMap.get(row.toUserId);
  if (!sender || !recipient) {
    throw new AppError("NOT_FOUND", "Transfer parties not found", 404);
  }

  const now = nowIso();
  const amountCents = asCents(row.amountCents);
  const recipientTxId = randomUUID();
  const note = row.note as string | null;

  await withDbTransaction(async (tx) => {
    await tx
      .update(internalTransfers)
      .set({
        status: "completed",
        reviewedBy: actor.id,
        reviewedAt: now,
      })
      .where(eq(internalTransfers.id, transferId));

    await postLedgerEntry({
      userId: row.toUserId,
      type: "transfer_in",
      amountCents,
      asset: "USD",
      refType: "internal_transfer",
      refId: transferId,
      note: note
        ? `Transfer from ${sender.email}: ${note}`
        : `Transfer from ${sender.email}`,
      executor: tx,
    });

    await tx.insert(transactions).values({
      id: recipientTxId,
      userId: row.toUserId,
      type: "transfer",
      amountCents,
      asset: "USD",
      status: "confirmed",
      txRef: transferId,
      meta: JSON.stringify({
        direction: "in",
        counterpartyUserId: row.fromUserId,
        counterpartyEmail: sender.email,
        note: note ?? null,
      }),
      createdAt: now,
    });
  });

  await markSenderTx(transferId, "confirmed");

  await logEvent({
    actorId: actor.id,
    action: "transfer.approve",
    resourceType: "internal_transfer",
    resourceId: transferId,
    meta: { fromUserId: row.fromUserId, toUserId: row.toUserId, amountCents },
  });

  try {
    await notifyTransferSent(
      row.fromUserId,
      amountCents,
      recipient.email,
      recipient.name,
    );
    await notifyTransferReceived(
      row.toUserId,
      amountCents,
      sender.email,
      sender.name,
    );
  } catch (e) {
    console.warn("[transfer] notify approve failed", e);
  }

  const updated = (await db
    .select()
    .from(internalTransfers)
    .where(eq(internalTransfers.id, transferId))) as any[];
  return updated[0]!;
}

/**
 * Admin rejects a pending transfer and refunds the sender.
 */
export async function rejectTransfer(
  actorId: string,
  transferId: string,
  note?: string,
) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "transfers.review");

  const row = await loadTransferOrThrow(transferId);
  if (row.status !== "pending_approval") {
    throw new AppError("INVALID_STATE", `Cannot reject from ${row.status}`);
  }

  const amountCents = asCents(row.amountCents);
  const reviewerNote = note?.trim() || "Rejected by admin";
  const now = nowIso();
  const db = getDb();

  await withDbTransaction(async (tx) => {
    await postLedgerEntry({
      userId: row.fromUserId,
      type: "refund",
      amountCents,
      asset: "USD",
      refType: "internal_transfer",
      refId: transferId,
      note: reviewerNote,
      executor: tx,
    });

    await tx
      .update(internalTransfers)
      .set({
        status: "rejected",
        reviewedBy: actor.id,
        reviewedAt: now,
        reviewerNote,
      })
      .where(eq(internalTransfers.id, transferId));
  });

  await markSenderTx(transferId, "failed");

  await logEvent({
    actorId: actor.id,
    action: "transfer.reject",
    resourceType: "internal_transfer",
    resourceId: transferId,
    meta: { note: reviewerNote },
  });

  const userMap = await loadUsersByIds([row.toUserId]);
  const recipient = userMap.get(row.toUserId);

  try {
    await notifyTransferRejected(
      row.fromUserId,
      amountCents,
      recipient?.email ?? "recipient",
      reviewerNote,
    );
  } catch (e) {
    console.warn("[transfer] notify reject failed", e);
  }

  const updated = (await db
    .select()
    .from(internalTransfers)
    .where(eq(internalTransfers.id, transferId))) as any[];
  return updated[0]!;
}
