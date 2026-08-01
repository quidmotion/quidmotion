import "server-only";
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  platformStatsDaily,
  users,
  userInvestments,
  properties,
  kycSubmissions,
  payouts,
  transactions,
} from "@/lib/db/schema";

export function getPlatformStats() {
  const db = getDb();
  const latest = db
    .select()
    .from(platformStatsDaily)
    .orderBy(desc(platformStatsDaily.asOf))
    .get();

  if (latest) {
    return {
      totalInvestedCents: latest.totalInvestedCents,
      avgRoiBps: latest.avgRoiBps,
      propertiesFunded: latest.propertiesFunded,
      activeUsers: latest.activeUsers,
      asOf: latest.asOf,
    };
  }

  // Derive live from tables if seed stats missing
  const allUsers = db.select().from(users).all();
  const inv = db.select().from(userInvestments).all();
  const props = db.select().from(properties).all();
  const totalInvestedCents = inv.reduce((s, i) => s + i.principalCents, 0);
  return {
    totalInvestedCents,
    avgRoiBps: 1250,
    propertiesFunded: props.filter((p) => p.status === "funded" || p.status === "live").length,
    activeUsers: allUsers.filter((u) => u.role === "user").length,
    asOf: new Date().toISOString(),
  };
}

export function getAdminOverview() {
  const db = getDb();
  const allUsers = db.select().from(users).all();
  const inv = db.select().from(userInvestments).all();
  const kyc = db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.status, "pending"))
    .all();
  const pendingPays = db
    .select()
    .from(payouts)
    .where(eq(payouts.status, "pending_approval"))
    .all();
  const processingPays = db
    .select()
    .from(payouts)
    .where(eq(payouts.status, "processing"))
    .all();

  const pendingDeposits = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "deposit"),
        eq(transactions.status, "pending"),
      ),
    )
    .all();

  return {
    totalUsers: allUsers.length,
    totalAumCents: inv
      .filter((i) => i.status === "active" || i.status === "maturing")
      .reduce((s, i) => s + i.principalCents, 0),
    pendingKyc: kyc.length,
    pendingWithdrawals: pendingPays.length + processingPays.length,
    pendingDeposits: pendingDeposits.length,
  };
}
