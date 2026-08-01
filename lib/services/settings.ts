import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertAdmin, loadActor } from "./_authz";
import { logEvent } from "./audit";

export const SETTING_KEYS = {
  depositWallet: (asset: string) => `deposit_wallet_${asset.toUpperCase()}`,
  depositNetwork: (asset: string) => `deposit_network_${asset.toUpperCase()}`,
  emailContact: "email_contact",
  emailSupport: "email_support",
  emailNoreply: "email_noreply",
} as const;

export const DEPOSIT_ASSETS = ["USDT", "USDC", "BTC", "ETH"] as const;

function nowIso() {
  return new Date().toISOString();
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .get();
  return row?.value ?? null;
}

export function getSettingOrDefault(key: string, fallback: string): string {
  return getSetting(key) ?? fallback;
}

export function setSetting(
  actorId: string,
  key: string,
  value: string,
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  const now = nowIso();
  const existing = db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .get();
  if (existing) {
    db.update(platformSettings)
      .set({ value, updatedAt: now, updatedBy: actor.id })
      .where(eq(platformSettings.key, key))
      .run();
  } else {
    db.insert(platformSettings)
      .values({ key, value, updatedAt: now, updatedBy: actor.id })
      .run();
  }
  logEvent({
    actorId: actor.id,
    action: "settings.update",
    resourceType: "platform_settings",
    resourceId: key,
    meta: { valuePreview: value.slice(0, 64) },
  });
  return { key, value, updatedAt: now };
}

export function setSettings(
  actorId: string,
  entries: Record<string, string>,
) {
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null) continue;
    setSetting(actorId, key, String(value).trim());
  }
}

export function getDepositWallets() {
  return DEPOSIT_ASSETS.map((asset) => ({
    asset,
    address: getSettingOrDefault(
      SETTING_KEYS.depositWallet(asset),
      "",
    ),
    network: getSettingOrDefault(
      SETTING_KEYS.depositNetwork(asset),
      asset === "BTC" ? "Bitcoin" : "Ethereum",
    ),
  }));
}

export function getOfficialEmails() {
  return {
    contact: getSettingOrDefault(
      SETTING_KEYS.emailContact,
      "contact@quidmotion.com",
    ),
    support: getSettingOrDefault(
      SETTING_KEYS.emailSupport,
      "support@quidmotion.com",
    ),
    noreply: getSettingOrDefault(
      SETTING_KEYS.emailNoreply,
      "noreply@quidmotion.com",
    ),
  };
}

export function updateDepositWallets(
  actorId: string,
  wallets: { asset: string; address: string; network?: string }[],
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  for (const w of wallets) {
    const asset = w.asset.toUpperCase();
    if (!DEPOSIT_ASSETS.includes(asset as (typeof DEPOSIT_ASSETS)[number])) {
      throw new AppError("VALIDATION", `Unsupported asset: ${asset}`);
    }
    if (!w.address?.trim()) {
      throw new AppError("VALIDATION", `${asset} deposit address is required`);
    }
    setSetting(actorId, SETTING_KEYS.depositWallet(asset), w.address.trim());
    if (w.network?.trim()) {
      setSetting(actorId, SETTING_KEYS.depositNetwork(asset), w.network.trim());
    }
  }
  return getDepositWallets();
}

export function updateOfficialEmails(
  actorId: string,
  emails: { contact?: string; support?: string; noreply?: string },
) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emails.contact !== undefined) {
    if (!emailRe.test(emails.contact)) {
      throw new AppError("VALIDATION", "Invalid contact email");
    }
    setSetting(actorId, SETTING_KEYS.emailContact, emails.contact.trim());
  }
  if (emails.support !== undefined) {
    if (!emailRe.test(emails.support)) {
      throw new AppError("VALIDATION", "Invalid support email");
    }
    setSetting(actorId, SETTING_KEYS.emailSupport, emails.support.trim());
  }
  if (emails.noreply !== undefined) {
    if (!emailRe.test(emails.noreply)) {
      throw new AppError("VALIDATION", "Invalid no-reply email");
    }
    setSetting(actorId, SETTING_KEYS.emailNoreply, emails.noreply.trim());
  }
  return getOfficialEmails();
}

export function listAllSettings(actorId: string) {
  const actor = loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return db.select().from(platformSettings).all();
}
