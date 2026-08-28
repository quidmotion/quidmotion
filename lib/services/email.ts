import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailOutbox, users } from "@/lib/db/schema";
import { formatUsd } from "@/lib/money";
import { siteConfig } from "@/lib/config/site";
import nodemailer from "nodemailer";
import {
  getEmailProvider,
  getOfficialEmails,
  type EmailProvider,
} from "./settings";
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
  | "transfer_sent"
  | "transfer_received"
  | "transfer_pending"
  | "transfer_rejected"
  | "password_reset"
  | "generic";

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function gmailAppPassword() {
  return process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "").trim() ?? "";
}

export function isGmailSmtpConfigured() {
  return Boolean(gmailAppPassword());
}

export function isGmailAddress(addr: string) {
  const lower = addr.trim().toLowerCase();
  return lower.endsWith("@gmail.com") || lower.endsWith("@googlemail.com");
}

export async function isSelectedMailTransportConfigured() {
  const provider = await getEmailProvider();
  return provider === "gmail_smtp"
    ? isGmailSmtpConfigured()
    : isResendConfigured();
}

function resolveGmailUser(from: string): string | null {
  const envUser = process.env.GMAIL_USER?.trim();
  if (envUser) return envUser;
  if (isGmailAddress(from)) return from.trim();
  return null;
}

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

async function logToDisk(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string; mode: string }> {
  try {
    const dir = path.join(process.cwd(), "data", "emails");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `${Date.now()}_${input.to.replace(/[^a-z0-9@._-]/gi, "_")}.eml.html`,
    );
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

async function deliverViaGmail(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string; mode: string }> {
  const pass = gmailAppPassword();
  const user = resolveGmailUser(input.from);
  if (!pass) {
    return {
      ok: false,
      error:
        "Gmail SMTP is selected but GMAIL_APP_PASSWORD is not set in the host env.",
      mode: "gmail_smtp",
    };
  }
  if (!user) {
    return {
      ok: false,
      error:
        "Gmail SMTP is selected but GMAIL_USER is unset and the no-reply address is not a Gmail mailbox.",
      mode: "gmail_smtp",
    };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `${siteConfig.name} <${input.from}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { ok: true, mode: "gmail_smtp" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gmail SMTP failed",
      mode: "gmail_smtp",
    };
  }
}

async function deliverViaResend(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string; mode: string }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    return logToDisk(input);
  }
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

async function deliverViaProvider(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  provider: EmailProvider;
}): Promise<{ ok: boolean; error?: string; mode: string }> {
  if (input.provider === "gmail_smtp") {
    return deliverViaGmail(input);
  }
  return deliverViaResend(input);
}

export async function enqueueEmail(input: {
  toEmail: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  kind: EmailKind;
  meta?: Record<string, unknown>;
}) {
  const emails = await getOfficialEmails();
  const from = emails.noreply;
  const html = wrapHtml(input.title, input.bodyHtml, emails.support);
  const id = randomUUID();
  const createdAt = nowIso();
  const db = getDb();

  await db.insert(emailOutbox).values({
    id,
    toEmail: input.toEmail,
    fromEmail: from,
    subject: input.title,
    bodyHtml: html,
    bodyText: input.bodyText,
    kind: input.kind,
    status: "pending",
    meta: input.meta ? JSON.stringify(input.meta) : null,
    createdAt,
  });

  return id;
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
  const emails = await getOfficialEmails();
  const from = emails.noreply;
  const html = wrapHtml(input.title, input.bodyHtml, emails.support);
  const id = randomUUID();
  const createdAt = nowIso();
  const db = getDb();

  await db.insert(emailOutbox).values({
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
  });

  const result = await deliverViaProvider({
    to: input.to,
    from,
    subject: input.subject,
    html,
    text: input.bodyText,
    provider: emails.provider,
  });

  const status = result.ok
    ? result.mode === "logged"
      ? "logged"
      : "sent"
    : "failed";

  await db
    .update(emailOutbox)
    .set({
      status,
      sentAt: result.ok ? nowIso() : null,
      error: result.error ?? null,
    })
    .where(eq(emailOutbox.id, id));

  return { id, status, error: result.error };
}

async function userEmail(userId: string) {
  const db = getDb();
  const rows = (await db
    .select()
    .from(users)
    .where(eq(users.id, userId))) as any[];
  return rows[0];
}

export async function notifyDepositRequested(
  userId: string,
  amountCents: number,
  asset: string,
  txRef?: string,
) {
  const user = await userEmail(userId);
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
  const user = await userEmail(userId);
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
  const user = await userEmail(userId);
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
  const user = await userEmail(userId);
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
  const user = await userEmail(userId);
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

export async function notifyTransferPending(
  userId: string,
  amountCents: number,
  recipientEmail: string,
  recipientName: string,
) {
  const user = await userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  await sendTransactionalEmail({
    to: user.email,
    subject: `Transfer submitted — ${amount}`,
    title: "Transfer pending review",
    kind: "transfer_pending",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>Your transfer of <strong style="color:#f4f4f7;">${amount}</strong> to <strong style="color:#f4f4f7;">${recipientName}</strong> (${recipientEmail}) has been submitted for admin review.</p>
      <p>The amount has been reserved from your available balance. You will be notified when it is approved or declined.</p>`,
    bodyText: `Hello ${user.name},\n\nYour transfer of ${amount} to ${recipientName} (${recipientEmail}) is pending admin review. The amount has been reserved from your available balance.`,
    meta: { userId, amountCents, recipientEmail },
  });
}

export async function notifyTransferRejected(
  userId: string,
  amountCents: number,
  recipientEmail: string,
  note?: string,
) {
  const user = await userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  const reason = note
    ? `<p>Reason: ${note}</p>`
    : "";
  await sendTransactionalEmail({
    to: user.email,
    subject: `Transfer declined — ${amount}`,
    title: "Transfer declined",
    kind: "transfer_rejected",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>Your transfer of <strong style="color:#f4f4f7;">${amount}</strong> to ${recipientEmail} was declined.</p>
      ${reason}
      <p>The reserved funds have been restored to your available balance.</p>`,
    bodyText: `Hello ${user.name},\n\nYour transfer of ${amount} to ${recipientEmail} was declined.${note ? `\nReason: ${note}` : ""}\nThe reserved funds have been restored to your available balance.`,
    meta: { userId, amountCents, recipientEmail, note },
  });
}

export async function notifyTransferSent(
  userId: string,
  amountCents: number,
  recipientEmail: string,
  recipientName: string,
) {
  const user = await userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  await sendTransactionalEmail({
    to: user.email,
    subject: `Transfer sent — ${amount}`,
    title: "Transfer sent",
    kind: "transfer_sent",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>Your transfer of <strong style="color:#f4f4f7;">${amount}</strong> to <strong style="color:#f4f4f7;">${recipientName}</strong> (${recipientEmail}) has been approved and completed.</p>
      <p>You can review it under Transactions.</p>`,
    bodyText: `Hello ${user.name},\n\nYour transfer of ${amount} to ${recipientName} (${recipientEmail}) has been approved and completed.`,
    meta: { userId, amountCents, recipientEmail },
  });
}

export async function notifyTransferReceived(
  userId: string,
  amountCents: number,
  senderEmail: string,
  senderName: string,
) {
  const user = await userEmail(userId);
  if (!user) return;
  const amount = formatUsd(amountCents);
  await sendTransactionalEmail({
    to: user.email,
    subject: `Transfer received — ${amount}`,
    title: "Transfer received",
    kind: "transfer_received",
    bodyHtml: `<p>Hello ${user.name},</p>
      <p>You received <strong style="color:#f4f4f7;">${amount}</strong> in available balance from <strong style="color:#f4f4f7;">${senderName}</strong> (${senderEmail}).</p>
      <p>Funds are ready to invest or withdraw subject to platform rules.</p>`,
    bodyText: `Hello ${user.name},\n\nYou received ${amount} from ${senderName} (${senderEmail}). Funds are in your available balance.`,
    meta: { userId, amountCents, senderEmail },
  });
}

export async function notifyKycStatus(
  userId: string,
  status: "submitted" | "approved" | "rejected",
  note?: string,
) {
  const user = await userEmail(userId);
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

export async function notifyPasswordReset(
  to: string,
  name: string,
  resetUrl: string,
) {
  await sendTransactionalEmail({
    to,
    subject: `Reset your ${siteConfig.name} password`,
    title: "Password reset",
    kind: "password_reset",
    bodyHtml: `<p>Hello ${name},</p>
      <p>We received a request to reset the password for your ${siteConfig.name} account.</p>
      <p><a href="${resetUrl}" style="display:inline-block;margin:12px 0;padding:12px 20px;background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Reset password</a></p>
      <p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>
      <p style="word-break:break-all;font-size:12px;color:#6b6b80;">${resetUrl}</p>`,
    bodyText: `Hello ${name},\n\nReset your ${siteConfig.name} password (expires in 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    meta: { kind: "password_reset" },
  });
}

export async function listEmailOutbox(actorId: string, limit = 50) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const rows = (await db
    .select()
    .from(emailOutbox)
    .orderBy(desc(emailOutbox.createdAt))) as any[];
  return rows.slice(0, limit);
}
