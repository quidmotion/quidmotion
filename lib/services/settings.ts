import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertAdmin, assertPrivilege, loadActor } from "./_authz";
import { logEvent } from "./audit";

export const EMAIL_PROVIDERS = ["gmail_smtp", "resend"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const SETTING_KEYS = {
  depositWallet: (asset: string) => `deposit_wallet_${asset.toUpperCase()}`,
  depositNetwork: (asset: string) => `deposit_network_${asset.toUpperCase()}`,
  emailContact: "email_contact",
  emailSupport: "email_support",
  emailNoreply: "email_noreply",
  emailProvider: "email_provider",
} as const;

export function isEmailProvider(value: string): value is EmailProvider {
  return (EMAIL_PROVIDERS as readonly string[]).includes(value);
}

export const DEPOSIT_ASSETS = ["USDT", "USDC", "BTC", "ETH"] as const;

function nowIso() {
  return new Date().toISOString();
}

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const rows = (await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, key))) as any[];
  return rows[0]?.value ?? null;
}

export async function getSettingOrDefault(
  key: string,
  fallback: string,
): Promise<string> {
  const val = await getSetting(key);
  return val ?? fallback;
}

/** Low-level write — caller must already authorize. */
export async function writeSetting(
  actorId: string,
  key: string,
  value: string,
) {
  const db = getDb();
  const now = nowIso();
  const existing = await getSetting(key);
  if (existing !== null) {
    await db
      .update(platformSettings)
      .set({ value, updatedAt: now, updatedBy: actorId })
      .where(eq(platformSettings.key, key));
  } else {
    await db
      .insert(platformSettings)
      .values({ key, value, updatedAt: now, updatedBy: actorId });
  }
  await logEvent({
    actorId,
    action: "settings.update",
    resourceType: "platform_settings",
    resourceId: key,
    meta: { valuePreview: value.slice(0, 64) },
  });
  return { key, value, updatedAt: now };
}

/** Admin-only generic setting write. */
export async function setSetting(actorId: string, key: string, value: string) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  return writeSetting(actor.id, key, value);
}

export async function setSettings(
  actorId: string,
  entries: Record<string, string>,
) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null) continue;
    await writeSetting(actor.id, key, String(value).trim());
  }
}

export async function getDepositWallets() {
  return Promise.all(
    DEPOSIT_ASSETS.map(async (asset: any) => ({
      asset,
      address: await getSettingOrDefault(SETTING_KEYS.depositWallet(asset), ""),
      network: await getSettingOrDefault(
        SETTING_KEYS.depositNetwork(asset),
        asset === "BTC" ? "Bitcoin" : "Ethereum",
      ),
    })),
  );
}

export async function getEmailProvider(): Promise<EmailProvider> {
  const raw = (
    await getSettingOrDefault(SETTING_KEYS.emailProvider, "resend")
  ).trim();
  return raw === "gmail_smtp" ? "gmail_smtp" : "resend";
}

export async function getOfficialEmails() {
  return {
    contact: await getSettingOrDefault(
      SETTING_KEYS.emailContact,
      "contact@quidmotion.com",
    ),
    support: await getSettingOrDefault(
      SETTING_KEYS.emailSupport,
      "support@quidmotion.com",
    ),
    noreply: await getSettingOrDefault(
      SETTING_KEYS.emailNoreply,
      "noreply@quidmotion.com",
    ),
    provider: await getEmailProvider(),
  };
}

export async function updateDepositWallets(
  actorId: string,
  wallets: { asset: string; address: string; network?: string }[],
) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "settings.wallets");
  for (const w of wallets) {
    const asset = w.asset.toUpperCase();
    if (!DEPOSIT_ASSETS.includes(asset as (typeof DEPOSIT_ASSETS)[number])) {
      throw new AppError("VALIDATION", `Unsupported asset: ${asset}`);
    }
    if (!w.address?.trim()) {
      throw new AppError("VALIDATION", `${asset} deposit address is required`);
    }
    await writeSetting(
      actor.id,
      SETTING_KEYS.depositWallet(asset),
      w.address.trim(),
    );
    if (w.network?.trim()) {
      await writeSetting(
        actor.id,
        SETTING_KEYS.depositNetwork(asset),
        w.network.trim(),
      );
    }
  }
  return getDepositWallets();
}

export async function updateOfficialEmails(
  actorId: string,
  emails: {
    contact?: string;
    support?: string;
    noreply?: string;
    provider?: string;
  },
) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "settings.emails");
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emails.contact !== undefined) {
    if (!emailRe.test(emails.contact)) {
      throw new AppError("VALIDATION", "Invalid contact email");
    }
    await writeSetting(
      actor.id,
      SETTING_KEYS.emailContact,
      emails.contact.trim(),
    );
  }
  if (emails.support !== undefined) {
    if (!emailRe.test(emails.support)) {
      throw new AppError("VALIDATION", "Invalid support email");
    }
    await writeSetting(
      actor.id,
      SETTING_KEYS.emailSupport,
      emails.support.trim(),
    );
  }
  if (emails.noreply !== undefined) {
    if (!emailRe.test(emails.noreply)) {
      throw new AppError("VALIDATION", "Invalid no-reply email");
    }
    await writeSetting(
      actor.id,
      SETTING_KEYS.emailNoreply,
      emails.noreply.trim(),
    );
  }
  if (emails.provider !== undefined) {
    const provider = emails.provider.trim();
    if (!isEmailProvider(provider)) {
      throw new AppError("VALIDATION", "Invalid mail transport");
    }
    await writeSetting(actor.id, SETTING_KEYS.emailProvider, provider);
  }
  return getOfficialEmails();
}

export async function listAllSettings(actorId: string) {
  const actor = await loadActor(actorId);
  assertAdmin(actor);
  const db = getDb();
  return (await db.select().from(platformSettings)) as any[];
}
