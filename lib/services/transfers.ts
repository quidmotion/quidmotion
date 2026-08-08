import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
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
  notifyTransferReceived,
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

/**
 * Instant available-balance transfer between two KYC-approved active users.
 * Debits sender and credits recipient in one DB transaction.
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
  const recipientTxId = randomUUID();

  await withDbTransaction(async (tx) => {
    await tx.insert(internalTransfers).values({
      id: transferId,
      fromUserId: actor.id,
      toUserId: recipient.id,
      amountCents,
      note: note ?? null,
      status: "completed",
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

    await postLedgerEntry({
      userId: recipient.id,
      type: "transfer_in",
      amountCents,
      asset: "USD",
      refType: "internal_transfer",
      refId: transferId,
      note: note
        ? `Transfer from ${actor.email}: ${note}`
        : `Transfer from ${actor.email}`,
      executor: tx,
    });

    await tx.insert(transactions).values({
      id: senderTxId,
      userId: actor.id,
      type: "transfer",
      amountCents: -amountCents,
      asset: "USD",
      status: "confirmed",
      txRef: transferId,
      meta: JSON.stringify({
        direction: "out",
        counterpartyUserId: recipient.id,
        counterpartyEmail: recipient.email,
        note: note ?? null,
      }),
      createdAt,
    });

    await tx.insert(transactions).values({
      id: recipientTxId,
      userId: recipient.id,
      type: "transfer",
      amountCents,
      asset: "USD",
      status: "confirmed",
      txRef: transferId,
      meta: JSON.stringify({
        direction: "in",
        counterpartyUserId: actor.id,
        counterpartyEmail: actor.email,
        note: note ?? null,
      }),
      createdAt,
    });
  });

  await logEvent({
    actorId: actor.id,
    action: "transfer.send",
    resourceType: "internal_transfer",
    resourceId: transferId,
    meta: {
      toUserId: recipient.id,
      toEmail: recipient.email,
      amountCents,
    },
  });

  // Best-effort notifications (outside transaction)
  try {
    await notifyTransferSent(
      actor.id,
      amountCents,
      recipient.email,
      recipient.name,
    );
    await notifyTransferReceived(
      recipient.id,
      amountCents,
      actor.email,
      actor.name,
    );
  } catch (e) {
    console.warn("[transfer] notify failed", e);
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
    .where(
      and(
        eq(internalTransfers.fromUserId, userId),
        eq(internalTransfers.status, "completed"),
      ),
    )
    .orderBy(desc(internalTransfers.createdAt))) as any[];
}
