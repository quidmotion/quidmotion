/**
 * Repair corrupted portfolio balances caused by BIGINT string concatenation.
 *
 * Default is dry-run (no writes). Pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/repair-portfolio-balances.ts
 *   npx tsx scripts/repair-portfolio-balances.ts --apply
 *   npx tsx scripts/repair-portfolio-balances.ts --apply --email=investor@quidmotion.com
 *   npx tsx scripts/repair-portfolio-balances.ts --threshold=1000000000
 *
 * Env:
 *   DB_PROVIDER=supabase DATABASE_URL=...   (production)
 *   DB_PROVIDER=local                       (local SQLite)
 *
 * Order: deploy code fix first, then dry-run, then --apply.
 * Always take a Supabase backup before --apply on production.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const emailArg = args.find((a) => a.startsWith("--email="));
const EMAIL_FILTER = emailArg ? emailArg.slice("--email=".length).toLowerCase() : null;
const thrArg = args.find((a) => a.startsWith("--threshold="));
const THRESHOLD = thrArg ? Number(thrArg.slice("--threshold=".length)) : 1_000_000_000;

// Demo seed baselines (used when ledger cannot rebuild available)
const DEMO_BASELINES: Record<
  string,
  { availableCents: number; lockedCents?: number }
> = {
  "investor@quidmotion.com": { availableCents: 1_250_000, lockedCents: 5_000_000 },
};

function asCents(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "bigint") return Number(value);
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const provider = (process.env.DB_PROVIDER ?? "local") as "local" | "supabase";
  console.log(`\n=== Portfolio balance repair ===`);
  console.log(`Mode: ${APPLY ? "APPLY (writes)" : "DRY-RUN (no writes)"}`);
  console.log(`Provider: ${provider}`);
  console.log(`Threshold: ${usd(THRESHOLD)} (${THRESHOLD} cents)`);
  if (EMAIL_FILTER) console.log(`Email filter: ${EMAIL_FILTER}`);
  console.log("");

  // Local adapter has no `server-only`. Supabase path uses raw postgres.js so we
  // never import lib/db/index (which pulls server-only via app services).
  let close: (() => Promise<void>) | null = null;
  let db: any;
  const { schema } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");

  if (provider === "supabase") {
    if (!process.env.DATABASE_URL && !(process.env.PGHOST && process.env.PGPASSWORD)) {
      console.error("DATABASE_URL (or PGHOST/PGPASSWORD) required for supabase provider.");
      process.exit(1);
    }
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const url = process.env.DATABASE_URL!;
    const int8AsNumber = {
      to: 20,
      from: [20],
      parse: (x: string) => {
        const n = Number(x);
        return Number.isSafeInteger(n) ? n : x;
      },
      serialize: (x: number | string | bigint) => String(x),
    };
    const client = postgres(url, {
      ssl: "require",
      max: 1,
      prepare: false,
      types: { bigint: int8AsNumber, int8: int8AsNumber },
    });
    db = drizzle(client, { schema });
    close = async () => {
      await client.end({ timeout: 5 });
    };
  } else {
    // createLocalAdapter is script-safe (no server-only)
    const { createLocalAdapter } = await import("../lib/db/adapters/local");
    const adapter = createLocalAdapter();
    db = adapter.db;
  }

  const users = (await db.select().from(schema.users)) as any[];
  const balances = (await db.select().from(schema.userBalances)) as any[];
  const balByUser = new Map(balances.map((b: any) => [b.userId, b]));

  type Candidate = {
    userId: string;
    email: string;
    availableCents: number;
    lockedCents: number;
    reason: string[];
  };

  const candidates: Candidate[] = [];

  for (const u of users) {
    const email = String(u.email ?? "").toLowerCase();
    if (EMAIL_FILTER && email !== EMAIL_FILTER) continue;
    const bal = balByUser.get(u.id) ?? {
      availableCents: 0,
      lockedCents: 0,
    };
    const available = asCents(bal.availableCents);
    const locked = asCents(bal.lockedCents);
    const reason: string[] = [];
    if (available > THRESHOLD) reason.push(`available ${usd(available)}`);
    if (locked > THRESHOLD) reason.push(`locked ${usd(locked)}`);
    if (available < 0) reason.push(`available negative ${available}`);
    if (locked < 0) reason.push(`locked negative ${locked}`);

    // Always include explicit email filter targets for repair even if under threshold
    if (EMAIL_FILTER && email === EMAIL_FILTER && reason.length === 0) {
      reason.push("explicit --email target");
    }

    if (reason.length) {
      candidates.push({
        userId: u.id,
        email: u.email,
        availableCents: available,
        lockedCents: locked,
        reason,
      });
    }
  }

  // Also scan investments for absurd ROI even if balances look ok
  if (!EMAIL_FILTER) {
    const allInv = (await db.select().from(schema.userInvestments)) as any[];
    for (const inv of allInv) {
      const roi = asCents(inv.roiToDateCents);
      const principal = asCents(inv.principalCents);
      if (roi > THRESHOLD || principal > THRESHOLD || roi < 0) {
        const u = users.find((x: any) => x.id === inv.userId);
        if (!u) continue;
        if (candidates.some((c) => c.userId === inv.userId)) continue;
        candidates.push({
          userId: inv.userId,
          email: u.email,
          availableCents: asCents(balByUser.get(inv.userId)?.availableCents),
          lockedCents: asCents(balByUser.get(inv.userId)?.lockedCents),
          reason: [
            `investment principal/roi over threshold (p=${usd(principal)} roi=${usd(roi)})`,
          ],
        });
      }
    }
  }

  if (candidates.length === 0) {
    console.log("No corrupted users found (under threshold). Nothing to do.");
    if (close) await close();
    return;
  }

  console.log(`Found ${candidates.length} user(s) to repair:\n`);

  for (const c of candidates) {
    console.log(`--- ${c.email} (${c.userId}) ---`);
    console.log(`  Before: available=${usd(c.availableCents)} locked=${usd(c.lockedCents)}`);
    console.log(`  Reason: ${c.reason.join("; ")}`);

    const invs = (await db
      .select()
      .from(schema.userInvestments)
      .where(eq(schema.userInvestments.userId, c.userId))) as any[];

    const active = invs.filter(
      (i: any) => i.status === "active" || i.status === "maturing",
    );
    const principalsSane = active.every(
      (i: any) =>
        asCents(i.principalCents) >= 0 &&
        asCents(i.principalCents) <= THRESHOLD,
    );

    let nextLocked = 0;
    if (principalsSane) {
      nextLocked = active.reduce(
        (s: number, i: any) => s + asCents(i.principalCents),
        0,
      );
    } else {
      const demo = DEMO_BASELINES[c.email.toLowerCase()];
      nextLocked = demo?.lockedCents ?? 0;
      console.log(`  WARN: principals not sane; locked fallback=${usd(nextLocked)}`);
    }

    // Rebuild available from ledger if entries look sane
    const ledger = (await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.userId, c.userId))) as any[];

    let nextAvailable: number | null = null;
    let ledgerOk =
      ledger.length > 0 &&
      ledger.every(
        (e: any) => Math.abs(asCents(e.amountCents)) <= THRESHOLD,
      );

    if (ledgerOk) {
      // Replay available only (subscribe lock is separate; ledger amount already
      // debits available; lockCents is not stored on ledger rows — use subscribe
      // amounts + current active principals for locked, available from sum of amounts)
      let avail = 0;
      for (const e of ledger) {
        avail += asCents(e.amountCents);
      }
      // If replay goes negative or absurd, discard
      if (avail < 0 || avail > THRESHOLD) {
        console.log(
          `  WARN: ledger replay available=${usd(avail)} not usable; falling back`,
        );
        ledgerOk = false;
      } else {
        nextAvailable = avail;
        console.log(`  Ledger replay available=${usd(avail)} (${ledger.length} entries)`);
      }
    }

    if (nextAvailable == null) {
      const demo = DEMO_BASELINES[c.email.toLowerCase()];
      if (demo) {
        nextAvailable = demo.availableCents;
        console.log(`  Using demo baseline available=${usd(nextAvailable)}`);
      } else {
        // Last resort: keep available if under threshold, else 0
        nextAvailable =
          c.availableCents >= 0 && c.availableCents <= THRESHOLD
            ? c.availableCents
            : 0;
        console.log(
          `  Fallback available=${usd(nextAvailable)} (no ledger/demo baseline)`,
        );
      }
    }

    // ROI: reset absurd values; keep if sane
    const invUpdates: {
      id: string;
      roiToDateCents: number;
      lastAccruedAt: string;
      principalCents: number;
    }[] = [];
    const ts = nowIso();
    for (const inv of active) {
      let principal = asCents(inv.principalCents);
      let roi = asCents(inv.roiToDateCents);
      if (principal > THRESHOLD || principal < 0) {
        const demo = DEMO_BASELINES[c.email.toLowerCase()];
        principal = demo?.lockedCents ?? 0;
      }
      if (roi > THRESHOLD || roi < 0) {
        roi = 0;
      }
      invUpdates.push({
        id: inv.id,
        principalCents: principal,
        roiToDateCents: roi,
        lastAccruedAt: ts, // prevent multi-year backfill after repair
      });
    }

    const snaps = (await db
      .select()
      .from(schema.portfolioValueSnapshots)
      .where(eq(schema.portfolioValueSnapshots.userId, c.userId))) as any[];
    const badSnaps = snaps.filter(
      (s: any) =>
        asCents(s.valueCents) > THRESHOLD || asCents(s.valueCents) < 0,
    );
    const cleanValue = nextAvailable + nextLocked;

    console.log(`  After:  available=${usd(nextAvailable)} locked=${usd(nextLocked)} total=${usd(cleanValue)}`);
    console.log(
      `  Investments to clock-reset: ${invUpdates.length}; snapshots: ${snaps.length} total, ${badSnaps.length} bad (will purge all + insert 1 clean)`,
    );

    if (!APPLY) {
      console.log(`  (dry-run — no writes)\n`);
      continue;
    }

    // Ensure balance row
    const existingBal = balByUser.get(c.userId);
    if (!existingBal) {
      await db.insert(schema.userBalances).values({
        userId: c.userId,
        availableCents: nextAvailable,
        lockedCents: nextLocked,
        updatedAt: ts,
      });
    } else {
      await db
        .update(schema.userBalances)
        .set({
          availableCents: nextAvailable,
          lockedCents: nextLocked,
          updatedAt: ts,
        })
        .where(eq(schema.userBalances.userId, c.userId));
    }

    for (const u of invUpdates) {
      await db
        .update(schema.userInvestments)
        .set({
          principalCents: u.principalCents,
          roiToDateCents: u.roiToDateCents,
          lastAccruedAt: u.lastAccruedAt,
        })
        .where(eq(schema.userInvestments.id, u.id));
    }

    // Purge all snapshots for user, insert one clean point
    if (snaps.length > 0) {
      // Delete one-by-one for drizzle sqlite/pg compatibility
      for (const s of snaps) {
        await db
          .delete(schema.portfolioValueSnapshots)
          .where(eq(schema.portfolioValueSnapshots.id, s.id));
      }
    }
    await db.insert(schema.portfolioValueSnapshots).values({
      id: randomUUID(),
      userId: c.userId,
      asOf: ts,
      valueCents: cleanValue,
    });

    // Audit adjustment ledger note (does not change balance again)
    await db.insert(schema.ledgerEntries).values({
      id: randomUUID(),
      userId: c.userId,
      type: "adjustment",
      amountCents: 0,
      asset: "USD",
      refType: "repair",
      refId: "portfolio-growth-fix",
      note: `Repair: set available=${nextAvailable} locked=${nextLocked} (was avail=${c.availableCents} locked=${c.lockedCents})`,
      createdAt: ts,
    });

    console.log(`  APPLIED.\n`);
  }

  console.log(APPLY ? "Repair complete." : "Dry-run complete. Re-run with --apply to write.");
  if (close) await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
