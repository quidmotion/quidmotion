import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { eq, and, isNull, gt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/crypto/password";
import { getDb } from "@/lib/db";
import {
  users,
  sessions,
  passwordResetTokens,
  userBalances,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type {
  AuthAdapter,
  AuthUser,
  Credentials,
  RegisterInput,
  Session,
  SealedClaims,
} from "../types";
import {
  mintSealedCookie,
  verifySealedToken,
  parseCookie,
  SEAL_COOKIE,
  SESSION_COOKIE,
} from "../sealed";

function nowIso() {
  return new Date().toISOString();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionTtlMs() {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 7);
  return days * 24 * 60 * 60 * 1000;
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    kycStatus: row.kycStatus,
    status: row.status,
    avatarUrl: row.avatarUrl,
    referralCode: row.referralCode,
    createdAt: row.createdAt,
    lockupDays: row.lockupDays ?? 90,
  };
}

async function setSessionCookies(
  opaqueToken: string,
  seal: string,
  expiresAt: Date,
) {
  const jar = await cookies();
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
  jar.set(SESSION_COOKIE, opaqueToken, common);
  jar.set(SEAL_COOKIE, seal, common);
}

async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(SEAL_COOKIE);
}

async function createSessionForUser(
  user: typeof users.$inferSelect,
): Promise<Session> {
  const db = getDb();
  const sessionId = randomUUID();
  const opaque = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  const createdAt = nowIso();

  await db.insert(sessions)
    .values({
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(opaque),
      expiresAt: expiresAt.toISOString(),
      createdAt,
    });

  const seal = await mintSealedCookie({
    sub: user.id,
    role: user.role,
    sid: sessionId,
    expiresAt,
  });
  await setSessionCookies(opaque, seal, expiresAt);

  return {
    user: toAuthUser(user),
    expiresAt: expiresAt.toISOString(),
    sessionId,
  };
}

/** Request-memoized session resolve so layout + page share one DB round-trip. */
const resolveSessionFromToken = cache(
  async (token: string | null): Promise<Session | null> => {
    if (!token) return null;
    const db = getDb();
    const rows = (await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)))) as any[];
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) return null;

    const userRows = (await db
      .select()
      .from(users)
      .where(eq(users.id, row.userId))) as any[];
    const user = userRows[0];
    if (!user || user.status === "suspended") return null;

    return {
      user: toAuthUser(user),
      expiresAt: row.expiresAt,
      sessionId: row.id,
    };
  },
);

export function createLocalAuth(): AuthAdapter {
  return {
    async register(input: RegisterInput): Promise<Session> {
      const db = getDb();
      const email = input.email.trim().toLowerCase();
      if (!email || !input.password || input.password.length < 8) {
        throw new AppError(
          "VALIDATION",
          "Valid email and password (8+ chars) required",
        );
      }
      const existingRows = (await db
        .select()
        .from(users)
        .where(eq(users.email, email))) as any[];
      if (existingRows[0]) {
        throw new AppError("CONFLICT", "Email already registered", 409);
      }

      const id = randomUUID();
      const createdAt = nowIso();
      const passwordHash = hashPassword(input.password);
      const referralCode = randomBytes(4).toString("hex").toUpperCase();

      let referredBy: string | null = null;
      if (input.referralCode) {
        const refRows = (await db
          .select()
          .from(users)
          .where(eq(users.referralCode, input.referralCode.toUpperCase()))) as any[];
        if (refRows[0]) referredBy = refRows[0].id;
      }

      await db.insert(users)
        .values({
          id,
          email,
          name: input.name.trim() || email.split("@")[0],
          passwordHash,
          role: "user",
          kycStatus: "none",
          status: "active",
          referralCode,
          referredBy,
          createdAt,
          updatedAt: createdAt,
        });

      await db.insert(userBalances)
        .values({
          userId: id,
          availableCents: 0,
          lockedCents: 0,
          updatedAt: createdAt,
        });

      const userRows = (await db.select().from(users).where(eq(users.id, id))) as any[];
      return createSessionForUser(userRows[0]!);
    },

    async login(input: Credentials): Promise<Session> {
      const db = getDb();
      const email = input.email.trim().toLowerCase();
      const userRows = (await db.select().from(users).where(eq(users.email, email))) as any[];
      const user = userRows[0];
      if (!user?.passwordHash) {
        throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
      }
      if (user.status === "suspended") {
        throw new AppError("FORBIDDEN", "Account suspended", 403);
      }
      if (!verifyPassword(input.password, user.passwordHash)) {
        throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
      }
      return createSessionForUser(user);
    },

    async logout(): Promise<void> {
      const jar = await cookies();
      const token = jar.get(SESSION_COOKIE)?.value;
      if (token) {
        const db = getDb();
        await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      }
      await clearSessionCookies();
    },

    async getSession(): Promise<Session | null> {
      const jar = await cookies();
      return resolveSessionFromToken(jar.get(SESSION_COOKIE)?.value ?? null);
    },

    async verifySealedCookie(
      cookieHeader: string | null,
    ): Promise<SealedClaims | null> {
      const token = parseCookie(cookieHeader, SEAL_COOKIE);
      if (!token) return null;
      return verifySealedToken(token);
    },

    async getSessionFromCookies(
      cookieHeader: string | null,
    ): Promise<Session | null> {
      const token = parseCookie(cookieHeader, SESSION_COOKIE);
      return resolveSessionFromToken(token);
    },

    async requestPasswordReset(email: string): Promise<void> {
      const db = getDb();
      const userRows = (await db
        .select()
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))) as any[];
      const user = userRows[0];
      // Always succeed to avoid email enumeration
      if (!user) return;

      const raw = randomBytes(32).toString("hex");
      const id = randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await db.insert(passwordResetTokens)
        .values({
          id,
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt,
          createdAt: nowIso(),
        });

      const { getPublicSiteUrl } = await import("@/lib/config/public-url");
      const base = await getPublicSiteUrl();
      const resetUrl = `${base}/reset-password?token=${raw}`;
      const { notifyPasswordReset, isSelectedMailTransportConfigured } =
        await import("@/lib/services/email");
      await notifyPasswordReset(user.email, user.name, resetUrl);
      if (!(await isSelectedMailTransportConfigured())) {
        console.info(
          `[auth] reset link (mail transport not configured): ${resetUrl}`,
        );
      }
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
      if (!newPassword || newPassword.length < 8) {
        throw new AppError("VALIDATION", "Password must be at least 8 characters");
      }
      const db = getDb();
      const tokenRows = (await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hashToken(token)),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, nowIso()),
          ),
        )) as any[];
      const row = tokenRows[0];
      if (!row) {
        throw new AppError("VALIDATION", "Invalid or expired reset token");
      }
      const passwordHash = hashPassword(newPassword);
      await db.update(users)
        .set({ passwordHash, updatedAt: nowIso() })
        .where(eq(users.id, row.userId));
      await db.update(passwordResetTokens)
        .set({ usedAt: nowIso() })
        .where(eq(passwordResetTokens.id, row.id));
      await db.delete(sessions).where(eq(sessions.userId, row.userId));
    },
  };
}
