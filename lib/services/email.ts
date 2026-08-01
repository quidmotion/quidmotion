import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailOutbox, users } from "@/lib/db/schema";
import { formatUsd } from "@/lib/money";
import { siteConfig } from "@/lib/config/site";
import { getOfficialEmails } from "./settings";
import { assertAdmin, loadActor } from "./_authz";

export type EmailKind =
  | "deposit_requested"
  | "deposit_confirmed"
  | "investment_created"
  | "withdrawal_requested"
  | "withdrawal_completed"
  | "kyc_submitted"
  | "kyc_approved"
  | "kyc_rejected"
  | "generic";

function nowIso() {
  return new Date().toISOString();
}

function wrapHtml(title: string, body: string, supportEmail: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0b0f;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#f4f4f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b0f;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#12141c;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 12px;background:linear-gradient(135deg,#8b5cf6,#ec4899);">
              <div style="font-size:20px;font-weight:700;color:#fff;">${siteConfig.name}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.85);margin-top:4px;">Institutional real estate · Crypto rails</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#f4f4f7;">${title}</h1>
              <div style="font-size:14px;line-height:1.6;color:#a1a1b5;">${body}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;color:#6b6b80;line-height:1.5;">
              This is an automated message from a no-reply address. For assistance contact
              <a href="mailto:${supportEmail}" style="color:#a855f7;text-decoration:none;">${supportEmail}</a>.<br/>
              © ${new Date().getFullYear()} ${siteConfig.name}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function deliverViaProvider(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string; mode: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${siteConfig.name} <${input.from}>`,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Resend ${res.status}: ${body}`, mode: "resend" };
      }
      return { ok: true, mode: "resend" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Resend failed",
        mode: "resend",
      };
    }
  }

  // Local / no provider: write to disk outbox for inspection
  try {
    const dir = path.join(process.cwd(), "data", "emails");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}_${input.to.replace(/[^a-z0-9@._-]/gi, "_")}.eml.html`);
    fs.writeFileSync(
      file,
      `To: ${input.to}\nFrom: ${input.from}\nSubject: ${input.subject}\n\n${input.html}`,
      "utf8",
    );
    console.info(`[email] logged → ${file} | ${input.subject} → ${input.to}`);
    return { ok: true, mode: "logged" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Log failed",
      mode: "logged",
    };
  }
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  kind: EmailKind;
  meta?: Record<string, unknown>;
}) {
  const emails = getOfficialEmails();
  const from = emails.noreply;
  const html = wrapHtml(input.title, input.bodyHtml, emails.support);
  const id = randomUUID();
  const createdAt = nowIso();
  const db = getDb();

  db.insert(emailOutbox)
    .values({
      id,
      toEmail: input.to,
      fromEmail: from,
      subject: input.subject,
      bodyHtml: html,
      bodyText: input.bodyText,
      kind: input.kind,
      status: "pending",
      meta: input.meta ? JSON.stringify(input.meta) : null,
      createdAt,
    })
    .run();

  const result = await deliverViaProvider({
    to: input.to,
    from,
    subject: input.subject,
    html,
    text: input.bodyText,
  });

  const status = result.ok
    ? result.mode === "logged"
      ? "logged"
      : "sent"
    : "failed";

  db.update(emailOutbox)
    .set({
      status,
      sentAt: result.ok ? nowIso() : null,
      error: result.error ?? null,
    })
    .where(eq(emailOutbox.id, id))
    .run();

  return { id, status, error: result.error };
}

function userEmail(userId: string) {
  const db = getDb();
  return db.select().from(users).where(eq(users.id, userId)).get();
}

export async function notifyDepositRequested(
  userId: string,
  amountCents: number,
  asset: string,
  txRef?: string,
) {
  const user = userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  await sendTransactionalEmail({
    to: user.email,
    subject: `Deposit received for review — ${amount}`,
    title: "Deposit pending confirmation",
    kind: "deposit_requested",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>We received your deposit report for <strong style="color:#f4f4f7;">${amount}</strong> (${asset}).</p>
      ${txRef ? `<p>Reference: <code style="color:#c4b5fd;">${txRef}</code></p>` : ""}
      <p>Status: <strong style="color:#f59e0b;">Pending admin confirmation</strong>. Your balance will be credited once our team verifies the transfer on-chain. You will receive another email when funds are available.</p>`,
    bodyText: `Hello ${user.name},\n\nWe received your deposit report for ${amount} (${asset}).${txRef ? `\nReference: ${txRef}` : ""}\nStatus: Pending admin confirmation.`,
    meta: { userId, amountCents, asset, txRef },
  });
}

export async function notifyDepositConfirmed(
  userId: string,
  amountCents: number,
  asset: string,
) {
  const user = userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  await sendTransactionalEmail({
    to: user.email,
    subject: `Deposit confirmed — ${amount}`,
    title: "Deposit confirmed",
    kind: "deposit_confirmed",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>Your deposit of <strong style="color:#f4f4f7;">${amount}</strong> (${asset}) has been verified and credited to your ${siteConfig.name} account.</p>
      <p>You may now allocate funds to an investment plan from your dashboard.</p>`,
    bodyText: `Hello ${user.name},\n\nYour deposit of ${amount} (${asset}) has been verified and credited to your ${siteConfig.name} account.\n\nYou may now allocate funds to an investment plan from your dashboard.`,
    meta: { userId, amountCents, asset },
  });
}

export async function notifyInvestmentCreated(
  userId: string,
  amountCents: number,
  planName: string,
  lockupDays: number,
) {
  const user = userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  await sendTransactionalEmail({
    to: user.email,
    subject: `Investment confirmed — ${planName}`,
    title: "Investment confirmed",
    kind: "investment_created",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>Your investment of <strong style="color:#f4f4f7;">${amount}</strong> into the <strong style="color:#f4f4f7;">${planName}</strong> plan has been committed.</p>
      <p>Lock-up period: <strong style="color:#f4f4f7;">${lockupDays} days</strong>. Growth accrues automatically on invested principal according to your lock-up tier.</p>`,
    bodyText: `Hello ${user.name},\n\nYour investment of ${amount} into the ${planName} plan has been committed.\nLock-up: ${lockupDays} days.`,
    meta: { userId, amountCents, planName, lockupDays },
  });
}

export async function notifyWithdrawalRequested(
  userId: string,
  amountCents: number,
  address: string,
) {
  const user = userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  await sendTransactionalEmail({
    to: user.email,
    subject: `Withdrawal request received — ${amount}`,
    title: "Withdrawal request received",
    kind: "withdrawal_requested",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>We received your withdrawal request for <strong style="color:#f4f4f7;">${amount}</strong>.</p>
      <p>Destination address: <code style="color:#c4b5fd;word-break:break-all;">${address}</code></p>
      <p>Status: <strong style="color:#f59e0b;">Pending approval</strong>. Our team will review your request. You will receive another email when processing completes.</p>`,
    bodyText: `Hello ${user.name},\n\nWe received your withdrawal request for ${amount}.\nDestination: ${address}\nStatus: Pending approval.`,
    meta: { userId, amountCents, address },
  });
}

export async function notifyWithdrawalCompleted(
  userId: string,
  amountCents: number,
  address: string,
) {
  const user = userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  await sendTransactionalEmail({
    to: user.email,
    subject: `Withdrawal completed — ${amount}`,
    title: "Withdrawal completed",
    kind: "withdrawal_completed",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>Your withdrawal of <strong style="color:#f4f4f7;">${amount}</strong> has been marked <strong style="color:#22c55e;">completed</strong>.</p>
      <p>Funds were sent to: <code style="color:#c4b5fd;word-break:break-all;">${address}</code></p>
      <p>If you do not see the transfer on-chain shortly, contact support with your transaction reference.</p>`,
    bodyText: `Hello ${user.name},\n\nYour withdrawal of ${amount} has been completed.\nSent to: ${address}`,
    meta: { userId, amountCents, address },
  });
}

export async function notifyKycStatus(
  userId: string,
  status: "submitted" | "approved" | "rejected",
  note?: string,
) {
  const user = userEmail(userId);
  if (!user) return;
  if (status === "submitted") {
    await sendTransactionalEmail({
      to: user.email,
      subject: "KYC submission received",
      title: "KYC submission received",
      kind: "kyc_submitted",
      bodyHtml: `<p>Hello ${user.name},</p><p>Your identity verification package was received and is now under review.</p>`,
      bodyText: `Hello ${user.name},\n\nYour KYC submission was received and is under review.`,
      meta: { userId },
    });
    return;
  }
  if (status === "approved") {
    await sendTransactionalEmail({
      to: user.email,
      subject: "KYC approved — full access unlocked",
      title: "KYC approved",
      kind: "kyc_approved",
      bodyHtml: `<p>Hello ${user.name},</p><p>Your identity verification has been <strong style="color:#22c55e;">approved</strong>. You may now invest and request withdrawals.</p>`,
      bodyText: `Hello ${user.name},\n\nYour KYC has been approved. You may now invest and request withdrawals.`,
      meta: { userId },
    });
    return;
  }
  await sendTransactionalEmail({
    to: user.email,
    subject: "KYC decision — additional information required",
    title: "KYC not approved",
    kind: "kyc_rejected",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>Unfortunately we could not approve your KYC submission at this time.</p>
      ${note ? `<p>Reviewer note: ${note}</p>` : ""}
      <p>You may correct your details and resubmit from Account Settings.</p>`,
    bodyText: `Hello ${user.name},\n\nYour KYC was not approved.${note ? ` Note: ${note}` : ""}\nYou may resubmit from Account Settings.`,
    meta: { userId, note },
  });
}

export function listEmailOutbox(actorId: string, limit = 50) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return db
    .select()
    .from(emailOutbox)
    .orderBy(desc(emailOutbox.createdAt))
    .all()
    .slice(0, limit);
}
