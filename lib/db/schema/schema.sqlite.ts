import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["user", "admin", "support"] })
    .notNull()
    .default("user"),
  kycStatus: text("kyc_status", {
    enum: ["none", "pending", "approved", "rejected"],
  })
    .notNull()
    .default("none"),
  status: text("status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  avatarUrl: text("avatar_url"),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lockupDays: integer("lockup_days").notNull().default(90),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("sessions_token_hash_idx").on(t.tokenHash)],
);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const userBalances = sqliteTable("user_balances", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  availableCents: integer("available_cents").notNull().default(0),
  lockedCents: integer("locked_cents").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", {
      enum: [
        "deposit",
        "subscribe",
        "withdraw",
        "payout",
        "refund",
        "referral_reward",
        "adjustment",
        "yield",
      ],
    }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    asset: text("asset").notNull().default("USD"),
    refType: text("ref_type"),
    refId: text("ref_id"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("ledger_user_created_idx").on(t.userId, t.createdAt)],
);

export const investmentPlans = sqliteTable("investment_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  minInvestmentCents: integer("min_investment_cents").notNull(),
  apyMinBps: integer("apy_min_bps").notNull(),
  apyMaxBps: integer("apy_max_bps").notNull(),
  lockupDays: integer("lockup_days").notNull(),
  riskTier: text("risk_tier", { enum: ["low", "medium", "high"] }).notNull(),
  acceptedAssets: text("accepted_assets").notNull(), // JSON array
  status: text("status", { enum: ["active", "archived"] })
    .notNull()
    .default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url"),
  targetRaiseCents: integer("target_raise_cents").notNull(),
  raisedCents: integer("raised_cents").notNull().default(0),
  status: text("status", {
    enum: ["draft", "live", "funded", "closed"],
  })
    .notNull()
    .default("live"),
  expectedApyBps: integer("expected_apy_bps").notNull(),
  featured: integer("featured", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const userInvestments = sqliteTable(
  "user_investments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    planId: text("plan_id")
      .notNull()
      .references(() => investmentPlans.id),
    propertyId: text("property_id").references(() => properties.id),
    principalCents: integer("principal_cents").notNull(),
    status: text("status", {
      enum: ["active", "maturing", "completed", "cancelled"],
    })
      .notNull()
      .default("active"),
    startedAt: text("started_at").notNull(),
    maturesAt: text("matures_at").notNull(),
    roiToDateCents: integer("roi_to_date_cents").notNull().default(0),
    lastAccruedAt: text("last_accrued_at"),
    effectiveApyBps: integer("effective_apy_bps"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("investments_user_idx").on(t.userId)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", {
      enum: ["deposit", "withdraw", "invest", "payout", "fee", "reward", "yield"],
    }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    asset: text("asset").notNull().default("USDT"),
    status: text("status", {
      enum: ["pending", "confirmed", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    txRef: text("tx_ref"),
    meta: text("meta"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("tx_user_created_idx").on(t.userId, t.createdAt)],
);

/**
 * Withdrawal / distribution payouts.
 * Withdrawal lifecycle: pending_approval → processing → completed | rejected
 */
export const payouts = sqliteTable(
  "payouts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    investmentId: text("investment_id").references(() => userInvestments.id),
    payoutType: text("payout_type", {
      enum: ["withdrawal", "distribution"],
    }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", {
      enum: [
        "scheduled",
        "pending_approval",
        "processing",
        "completed",
        "failed",
        "rejected",
      ],
    })
      .notNull()
      .default("pending_approval"),
    withdrawalAddress: text("withdrawal_address"),
    withdrawalAsset: text("withdrawal_asset"),
    withdrawalNetwork: text("withdrawal_network"),
    scheduledAt: text("scheduled_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    completedAt: text("completed_at"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("payouts_status_idx").on(t.status)],
);

export const kycSubmissions = sqliteTable(
  "kyc_submissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", {
      enum: ["pending", "approved", "rejected"],
    })
      .notNull()
      .default("pending"),
    fullLegalName: text("full_legal_name"),
    dateOfBirth: text("date_of_birth"),
    country: text("country"),
    documentType: text("document_type"),
    documentNumber: text("document_number"),
    documentPaths: text("document_paths").notNull().default("[]"),
    reviewerNote: text("reviewer_note"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("kyc_status_idx").on(t.status)],
);

export const faqEntries = sqliteTable("faq_entries", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
});

export const documentsMeta = sqliteTable("documents_meta", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  bodyOverride: text("body_override"),
  lastUpdated: text("last_updated").notNull(),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("info"),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("notif_user_idx").on(t.userId)],
);

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  source: text("source").notNull().default("guide"),
  createdAt: text("created_at").notNull(),
});

export const referralRewards = sqliteTable("referral_rewards", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  fromUserId: text("from_user_id").references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["pending", "credited"] })
    .notNull()
    .default("pending"),
  createdAt: text("created_at").notNull(),
});

export const portfolioValueSnapshots = sqliteTable(
  "portfolio_value_snapshots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    asOf: text("as_of").notNull(),
    valueCents: integer("value_cents").notNull(),
  },
  (t) => [index("pvs_user_asof_idx").on(t.userId, t.asOf)],
);

export const priceSnapshots = sqliteTable("price_snapshots", {
  id: text("id").primaryKey(),
  asset: text("asset").notNull(),
  priceUsdCents: integer("price_usd_cents").notNull(),
  asOf: text("as_of").notNull(),
});

export const platformStatsDaily = sqliteTable("platform_stats_daily", {
  id: text("id").primaryKey(),
  asOf: text("as_of").notNull().unique(),
  totalInvestedCents: integer("total_invested_cents").notNull(),
  avgRoiBps: integer("avg_roi_bps").notNull(),
  propertiesFunded: integer("properties_funded").notNull(),
  activeUsers: integer("active_users").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  meta: text("meta"),
  createdAt: text("created_at").notNull(),
});

/** Key-value platform configuration (wallets, emails, etc.). */
export const platformSettings = sqliteTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

/**
 * Default portfolio growth APY by investment-size tier.
 * Randomized within band and refreshed hourly.
 */
export const defaultPortfolioRates = sqliteTable("default_portfolio_rates", {
  tier: text("tier").primaryKey(), // tier_500 | tier_2500 | tier_10000
  minInvestedCents: integer("min_invested_cents").notNull(),
  maxInvestedCents: integer("max_invested_cents"), // null = no upper bound
  apyMinBps: integer("apy_min_bps").notNull(),
  apyMaxBps: integer("apy_max_bps").notNull(),
  currentApyBps: integer("current_apy_bps").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Outbound transactional email log / outbox. */
export const emailOutbox = sqliteTable(
  "email_outbox",
  {
    id: text("id").primaryKey(),
    toEmail: text("to_email").notNull(),
    fromEmail: text("from_email").notNull(),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text").notNull(),
    kind: text("kind").notNull(),
    status: text("status", {
      enum: ["pending", "sent", "failed", "logged"],
    })
      .notNull()
      .default("pending"),
    meta: text("meta"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at"),
  },
  (t) => [index("email_outbox_status_idx").on(t.status)],
);

export const schema = {
  users,
  sessions,
  passwordResetTokens,
  userBalances,
  ledgerEntries,
  investmentPlans,
  properties,
  userInvestments,
  transactions,
  payouts,
  kycSubmissions,
  faqEntries,
  documentsMeta,
  notifications,
  leads,
  referralRewards,
  portfolioValueSnapshots,
  priceSnapshots,
  platformStatsDaily,
  auditEvents,
  platformSettings,
  defaultPortfolioRates,
  emailOutbox,
};
