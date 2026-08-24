/**
 * Seed local SQLite with demo data.
 * Run: npm run db:seed
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../lib/crypto/password";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim();
    }
  }
}

const dbPath = path.isAbsolute(process.env.DB_PATH ?? "")
  ? (process.env.DB_PATH as string)
  : path.join(process.cwd(), process.env.DB_PATH ?? "./data/quidmotion.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
for (const suffix of ["-wal", "-shm"]) {
  const p = dbPath + suffix;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

process.env.DB_PROVIDER = "local";
process.env.DB_PATH = dbPath;

async function main() {
  const { createLocalAdapter } = await import("../lib/db/adapters/local");
  const { schema } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const adapter = createLocalAdapter();
  const db = adapter.db;
  const now = new Date().toISOString();

  const adminId = randomUUID();
  const demoId = randomUUID();
  const demo2Id = randomUUID();

  // Demo passwords documented in README
  const adminHash = hashPassword("password123");
  const demoHash = hashPassword("password123");

  db.insert(schema.users)
    .values({
      id: adminId,
      email: "admin@quidmotion.com",
      name: "Admin User",
      passwordHash: adminHash,
      role: "admin",
      kycStatus: "approved",
      status: "active",
      referralCode: "ADMIN001",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.users)
    .values({
      id: demoId,
      email: "investor@quidmotion.com",
      name: "Gustavo Franci",
      passwordHash: demoHash,
      role: "user",
      kycStatus: "approved",
      status: "active",
      referralCode: "DEMO2024",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.users)
    .values({
      id: demo2Id,
      email: "newbie@quidmotion.com",
      name: "Alex New",
      passwordHash: demoHash,
      role: "user",
      kycStatus: "none",
      status: "active",
      referralCode: "NEWBIE01",
      referredBy: demoId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.userBalances)
    .values([
      {
        userId: adminId,
        availableCents: 0,
        lockedCents: 0,
        updatedAt: now,
      },
      {
        userId: demoId,
        availableCents: 1_250_000,
        lockedCents: 5_000_000,
        updatedAt: now,
      },
      {
        userId: demo2Id,
        availableCents: 0,
        lockedCents: 0,
        updatedAt: now,
      },
    ])
    .run();

  // Lock-up plans: effective APY = default portfolio APY × lock-up multiplier
  // Default APY by total invested: $500–$2.5k → 20–25%, $2.5k–$10k → 45–50%, ≥$10k → 60–70%
  // Multipliers: 90d=33%, 180d=66%, 365d=100%
  const plans = [
    {
      id: randomUUID(),
      name: "Starter",
      slug: "starter",
      description:
        "90-day lock-up. Earns 33% of the Default Portfolio Growth APY applicable to your total invested amount.",
      minInvestmentCents: 50_000,
      apyMinBps: 660, // ~33% of 20%
      apyMaxBps: 2310, // ~33% of 70%
      lockupDays: 90,
      riskTier: "low" as const,
    },
    {
      id: randomUUID(),
      name: "Growth",
      slug: "growth",
      description:
        "180-day lock-up. Earns 66% of the Default Portfolio Growth APY applicable to your total invested amount.",
      minInvestmentCents: 250_000,
      apyMinBps: 1320,
      apyMaxBps: 4620,
      lockupDays: 180,
      riskTier: "medium" as const,
    },
    {
      id: randomUUID(),
      name: "Elite",
      slug: "elite",
      description:
        "365-day lock-up. Earns 100% of the Default Portfolio Growth APY applicable to your total invested amount.",
      minInvestmentCents: 1_000_000,
      apyMinBps: 2000,
      apyMaxBps: 7000,
      lockupDays: 365,
      riskTier: "high" as const,
    },
  ];

  for (const p of plans) {
    db.insert(schema.investmentPlans)
      .values({
        ...p,
        acceptedAssets: JSON.stringify(["USDT", "USDC", "BTC", "ETH"]),
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const props = [
    {
      id: randomUUID(),
      name: "Harbor View Residences",
      location: "Austin, TX",
      description: "Class A multi-family near tech corridor.",
      targetRaiseCents: 250_000_000,
      raisedCents: 185_000_000,
      expectedApyBps: 1100,
      status: "live" as const,
    },
    {
      id: randomUUID(),
      name: "Summit Office Park",
      location: "Denver, CO",
      description: "Stabilized suburban office with long-term tenants.",
      targetRaiseCents: 400_000_000,
      raisedCents: 220_000_000,
      expectedApyBps: 950,
      status: "live" as const,
    },
    {
      id: randomUUID(),
      name: "Coastal Retail Strip",
      location: "Miami, FL",
      description: "Neighborhood retail anchored by national brands.",
      targetRaiseCents: 180_000_000,
      raisedCents: 180_000_000,
      expectedApyBps: 1250,
      status: "funded" as const,
    },
  ];

  for (const p of props) {
    db.insert(schema.properties)
      .values({
        id: p.id,
        name: p.name,
        location: p.location,
        description: p.description,
        targetRaiseCents: p.targetRaiseCents,
        raisedCents: p.raisedCents,
        status: p.status,
        expectedApyBps: p.expectedApyBps,
        featured: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const invId = randomUUID();
  const start = new Date();
  start.setDate(start.getDate() - 60);
  const matures = new Date(start);
  matures.setDate(matures.getDate() + plans[1].lockupDays);

  db.insert(schema.userInvestments)
    .values({
      id: invId,
      userId: demoId,
      planId: plans[1].id,
      propertyId: props[0].id,
      principalCents: 5_000_000,
      status: "active",
      startedAt: start.toISOString(),
      maturesAt: matures.toISOString(),
      roiToDateCents: 185_000,
      lastAccruedAt: now,
      // $50k invested → tier_10000 (60–70%); 180d lock → 66% → ~43% APY mid
      effectiveApyBps: 4290,
      createdAt: start.toISOString(),
    })
    .run();

  db.insert(schema.ledgerEntries)
    .values([
      {
        id: randomUUID(),
        userId: demoId,
        type: "deposit",
        amountCents: 6_250_000,
        asset: "USDT",
        refType: "transaction",
        createdAt: start.toISOString(),
      },
      {
        id: randomUUID(),
        userId: demoId,
        type: "subscribe",
        amountCents: -5_000_000,
        asset: "USD",
        refType: "investment",
        refId: invId,
        createdAt: start.toISOString(),
      },
    ])
    .run();

  db.insert(schema.transactions)
    .values([
      {
        id: randomUUID(),
        userId: demoId,
        type: "deposit",
        amountCents: 6_250_000,
        asset: "USDT",
        status: "confirmed",
        txRef: "mock_dep_001",
        createdAt: start.toISOString(),
      },
      {
        id: randomUUID(),
        userId: demoId,
        type: "invest",
        amountCents: 5_000_000,
        asset: "USD",
        status: "confirmed",
        createdAt: start.toISOString(),
      },
    ])
    .run();

  const payoutAt = new Date();
  payoutAt.setDate(payoutAt.getDate() + 14);
  db.insert(schema.payouts)
    .values({
      id: randomUUID(),
      userId: demoId,
      investmentId: invId,
      payoutType: "distribution",
      amountCents: 42_500,
      status: "scheduled",
      scheduledAt: payoutAt.toISOString(),
      createdAt: now,
    })
    .run();

  const base = 5_000_000;
  for (let d = 90; d >= 0; d--) {
    const asOf = new Date();
    asOf.setDate(asOf.getDate() - d);
    const growth = Math.round(
      base * (1 + (90 - d) * 0.0012) + Math.sin(d) * 8000,
    );
    db.insert(schema.portfolioValueSnapshots)
      .values({
        id: randomUUID(),
        userId: demoId,
        asOf: asOf.toISOString(),
        valueCents: growth + 1_250_000,
      })
      .run();
  }

  db.insert(schema.platformStatsDaily)
    .values({
      id: randomUUID(),
      asOf: now.slice(0, 10),
      totalInvestedCents: 4_850_000_000,
      avgRoiBps: 1120,
      propertiesFunded: 24,
      activeUsers: 1840,
    })
    .run();

  const faqs: [string, string, string][] = [
    [
      "Getting Started",
      "How do I start investing?",
      "Create an account, complete live KYC, deposit crypto to the published wallet addresses, then choose a lock-up plan.",
    ],
    [
      "Getting Started",
      "What is the minimum investment?",
      "Starter begins at $500 (90-day). Growth at $2,500 (180-day). Elite at $10,000 (365-day).",
    ],
    [
      "Crypto & Payments",
      "Which assets are accepted?",
      "USDT and USDC are primary; BTC and ETH are secondary. Live prices are shown from market feeds.",
    ],
    [
      "Crypto & Payments",
      "How do deposits work?",
      "Send funds to the platform deposit address for your asset, then submit a deposit report in the dashboard. An admin verifies the transfer and credits your balance.",
    ],
    [
      "Returns & Payouts",
      "How does portfolio growth work?",
      "Only invested principal earns growth. Default APY is tiered by total invested ($500–$2.5k: 200–250%, $2.5k–$10k: 250–300%, ≥$10k: 300–350%) and re-rolls hourly. Your lock-up multiplies that rate (90d 33%, 180d 66%, 365d 100%).",
    ],
    [
      "Returns & Payouts",
      "How do withdrawals work?",
      "KYC-approved users request a withdrawal with a destination address. Status goes pending approval → processing → completed after admin review and manual payout.",
    ],
    [
      "Security",
      "How is my account protected?",
      "Passwords use scrypt; sessions use sealed cookies; admin actions are audited; KYC documents are access-controlled.",
    ],
    [
      "Legal",
      "Where are the legal documents?",
      "See Documents for Terms, Privacy, Risk Disclosure, and AML/KYC Policy.",
    ],
  ];
  faqs.forEach(([category, question, answer], i) => {
    db.insert(schema.faqEntries)
      .values({
        id: randomUUID(),
        category,
        question,
        answer,
        sortOrder: i,
        published: true,
      })
      .run();
  });

  for (const [slug, title] of [
    ["terms", "Terms & Conditions"],
    ["privacy", "Privacy Policy"],
    ["risk-disclosure", "Risk Disclosure"],
    ["aml-kyc", "AML / KYC Policy"],
  ] as const) {
    db.insert(schema.documentsMeta)
      .values({
        id: randomUUID(),
        slug,
        title,
        lastUpdated: now,
      })
      .run();
  }

  db.insert(schema.notifications)
    .values([
      {
        id: randomUUID(),
        userId: demoId,
        title: "Welcome to QuidMotion",
        body: "Your demo portfolio is ready. Explore investments and upcoming payouts.",
        kind: "info",
        createdAt: now,
      },
      {
        id: randomUUID(),
        userId: demoId,
        title: "Distribution scheduled",
        body: "A distribution payout is scheduled in ~14 days.",
        kind: "payout",
        createdAt: now,
      },
    ])
    .run();

  db.insert(schema.referralRewards)
    .values({
      id: randomUUID(),
      userId: demoId,
      fromUserId: demo2Id,
      amountCents: 2500,
      status: "credited",
      createdAt: now,
    })
    .run();

  // priceUsdCents = USD * 100
  const prices: Record<string, number> = {
    USDT: 100,
    USDC: 100,
    BTC: 9_500_000,
    ETH: 350_000,
  };
  for (const asset of Object.keys(prices)) {
    db.insert(schema.priceSnapshots)
      .values({
        id: randomUUID(),
        asset,
        priceUsdCents: prices[asset],
        asOf: now,
      })
      .run();
  }

  // Platform settings (deposit wallets + official emails)
  const settings: [string, string][] = [
    ["deposit_wallet_USDT", "0xQUIDMOTION_LIVE_USDT_TREASURY"],
    ["deposit_wallet_USDC", "0xQUIDMOTION_LIVE_USDC_TREASURY"],
    ["deposit_wallet_BTC", "bc1qquidmotionlivetreasury000000000"],
    ["deposit_wallet_ETH", "0xQUIDMOTION_LIVE_ETH_TREASURY"],
    ["deposit_network_USDT", "Ethereum (ERC-20)"],
    ["deposit_network_USDC", "Ethereum (ERC-20)"],
    ["deposit_network_BTC", "Bitcoin"],
    ["deposit_network_ETH", "Ethereum"],
    ["email_contact", "contact@quidmotion.com"],
    ["email_support", "support@quidmotion.com"],
    ["email_noreply", "noreply@quidmotion.com"],
  ];
  // ensureSchema may have inserted defaults — overwrite with seed values
  for (const [key, value] of settings) {
    db.insert(schema.platformSettings)
      .values({ key, value, updatedAt: now, updatedBy: adminId })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value, updatedAt: now, updatedBy: adminId },
      })
      .run();
  }

  // Default portfolio growth tiers (hourly random within band)
  const tiers: {
    tier: string;
    minInvestedCents: number;
    maxInvestedCents: number | null;
    apyMinBps: number;
    apyMaxBps: number;
    currentApyBps: number;
  }[] = [
    {
      tier: "tier_500",
      minInvestedCents: 50_000,
      maxInvestedCents: 250_000,
      apyMinBps: 2000,
      apyMaxBps: 2500,
      currentApyBps: 2250,
    },
    {
      tier: "tier_2500",
      minInvestedCents: 250_000,
      maxInvestedCents: 1_000_000,
      apyMinBps: 4500,
      apyMaxBps: 5000,
      currentApyBps: 4750,
    },
    {
      tier: "tier_10000",
      minInvestedCents: 1_000_000,
      maxInvestedCents: null,
      apyMinBps: 6000,
      apyMaxBps: 7000,
      currentApyBps: 6500,
    },
  ];
  for (const t of tiers) {
    db.insert(schema.defaultPortfolioRates)
      .values({ ...t, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.defaultPortfolioRates.tier,
        set: {
          minInvestedCents: t.minInvestedCents,
          maxInvestedCents: t.maxInvestedCents,
          apyMinBps: t.apyMinBps,
          apyMaxBps: t.apyMaxBps,
          currentApyBps: t.currentApyBps,
          updatedAt: now,
        },
      })
      .run();
  }

  // touch eq import so unused check stays quiet if tree-shaken
  void eq;

  console.log("Seed complete:", dbPath);
  console.log("Investor: investor@quidmotion.com / password123");
  console.log("Admin:    admin@quidmotion.com / password123");
  await adapter.close?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
