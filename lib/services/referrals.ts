import "server-only";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { referralRewards, users } from "@/lib/db/schema";
import { features } from "@/lib/config/features";
import { AppError } from "@/lib/errors";
import { assertSelfOrAdmin, loadActor } from "./_authz";

export async function getRewards(actorId: string, userId: string) {
  if (!features.referrals) {
    throw new AppError("FORBIDDEN", "Referrals disabled", 403);
  }
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  const rewards = (await db
    .select()
    .from(referralRewards)
    .where(eq(referralRewards.userId, userId))
    .orderBy(desc(referralRewards.createdAt))) as any[];

  const userRows = (await db.select().from(users).where(eq(users.id, userId))) as any[];
  const user = userRows[0];
  const totalCents = rewards.reduce((s: any, r: any) => s + r.amountCents, 0);
  const pendingCents = rewards
    .filter((r: any) => r.status === "pending")
    .reduce((s: any, r: any) => s + r.amountCents, 0);
  const paidCents = totalCents - pendingCents;

  return {
    referralCode: user?.referralCode ?? "",
    rewards,
    // Real referral totals only — no fabricated multi-bucket split
    breakdown: [
      {
        key: "Paid rewards",
        amountCents: paidCents,
        color: "#22c55e",
      },
      {
        key: "Pending rewards",
        amountCents: pendingCents,
        color: "#8b5cf6",
      },
    ].filter((s: any) => s.amountCents > 0),
    totalCents,
    pendingCents,
    paidCents,
  };
}
