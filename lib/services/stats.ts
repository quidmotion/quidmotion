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

export async function getPlatformStats() {
  const db = getDb();
  const rows = (await db
    .select()
    .from(platformStatsDaily)
    .orderBy(desc(platformStatsDaily.asOf))) as any[];
  const latest = rows[0];

  if (latest) {
    return {
      totalInvestedCents: Number(latest.totalInvestedCents),
      avgRoiBps: latest.avgRoiBps,
      propertiesFunded: latest.propertiesFunded,
      activeUsers: latest.activeUsers,
      asOf: latest.asOf,
    };
  }

  // Derive live from tables if seed stats missing
  const allUsers = (await db.select().from(users)) as any[];
  const inv = (await db.select().from(userInvestments)) as any[];
  const props = (await db.select().from(properties)) as any[];
  const totalInvestedCents = inv.reduce((s: any, i: any) => s + i.principalCents, 0);
  return {
    totalInvestedCents,
    avgRoiBps: 1250,
    propertiesFunded: props.filter((p: any) => p.status === "funded" || p.status === "live").length,
    activeUsers: allUsers.filter((u: any) => u.role === "user").length,
    asOf: new Date().toISOString(),
  };
}

export async function getAdminOverview() {
  const db = getDb();
  const allUsers = (await db.select().from(users)) as any[];
  const inv = (await db.select().from(userInvestments)) as any[];
  const kyc = (await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.status, "pending"))) as any[];
  const pendingPays = (await db
    .select()
    .from(payouts)
    .where(eq(payouts.status, "pending_approval"))) as any[];
  const processingPays = (await db
    .select()
    .from(payouts)
    .where(eq(payouts.status, "processing"))) as any[];

  const pendingDeposits = (await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "deposit"),
        eq(transactions.status, "pending"),
      ),
    )) as any[];

  return {
    totalUsers: allUsers.length,
    totalAumCents: inv
      .filter((i: any) => i.status === "active" || i.status === "maturing")
      .reduce((s: any, i: any) => s + i.principalCents, 0),
    pendingKyc: kyc.length,
    pendingWithdrawals: pendingPays.length + processingPays.length,
    pendingDeposits: pendingDeposits.length,
  };
}
