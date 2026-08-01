import "server-only";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { referralRewards, users } from "@/lib/db/schema";
import { features } from "@/lib/config/features";
import { AppError } from "@/lib/errors";
import { assertSelfOrAdmin, loadActor } from "./_authz";

export function getRewards(actorId: string, userId: string) {
  if (!features.referrals) {
    throw new AppError("FORBIDDEN", "Referrals disabled", 403);
  }
  const actor = loadActor(actorId);
  assertSelfOrAdmin(actor, userId);
  const db = getDb();
  const rewards = db
    .select()
    .from(referralRewards)
    .where(eq(referralRewards.userId, userId))
    .orderBy(desc(referralRewards.createdAt))
    .all();

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  const totalCents = rewards.reduce((s, r) => s + r.amountCents, 0);
  const pendingCents = rewards
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + r.amountCents, 0);
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
    ].filter((s) => s.amountCents > 0),
    totalCents,
    pendingCents,
    paidCents,
  };
}
