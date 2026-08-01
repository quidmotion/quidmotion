// lib/actions/lockup.ts
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { users } from "@/lib/db/schema/schema.sqlite";
import { LOCKUP_OPTIONS } from "@/lib/constants";
import { accrueUserGrowth } from "@/lib/services/growth";
import { revalidatePath } from "next/cache";

/**
 * Update a user's lockup period.
 * Allows only increasing the period to a higher allowed value.
 */
export async function updateLockup(userId: string, newDays: typeof LOCKUP_OPTIONS[number]) {
  if (!LOCKUP_OPTIONS.includes(newDays)) {
    throw new Error("Invalid lockup period");
  }
  const db = getDb();
  const current = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
  if (!current) throw new Error("User not found");
  const currentDays = current.lockupDays ?? 90;
  if (newDays < currentDays) {
    throw new Error("Lockup period cannot be decreased");
  }
  await db.update(users).set({ lockupDays: newDays }).where(eq(users.id, userId));
  
  // Instantly update effective APY for all active positions for this user
  accrueUserGrowth(userId);
  revalidatePath("/dashboard/investments");
  revalidatePath("/dashboard");
}
