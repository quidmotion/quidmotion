/**
 * Local SQLite via Node built-in `node:sqlite` (DatabaseSync).
 * Duck-typed into drizzle-orm/better-sqlite3 (same prepare/run/get/all surface).
 * No native addons — no Visual Studio / better-sqlite3 required.
 * No `server-only` so seed scripts can import this module.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "../schema";
import type { DbAdapter } from "../types";

function resolveDbPath(): string {
  const raw = process.env.DB_PATH ?? "./data/quidmotion.db";
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

/**
 * Duck-type node:sqlite DatabaseSync as better-sqlite3 for drizzle-orm.
 * Critical: drizzle calls stmt.raw().all/get and expects array-mode rows
 * (positional values). better-sqlite3's Statement.raw() enables that mode;
 * node:sqlite exposes the same via setReturnArrays(true).
 */
function wrapClient(sqlite: DatabaseSync) {
  const originalPrepare = sqlite.prepare.bind(sqlite);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sqlite as any).prepare = (sql: string) => {
    const stmt = originalPrepare(sql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = stmt as any;

    // better-sqlite3: stmt.raw([boolean]) → statement; subsequent get/all return arrays
    if (typeof s.raw !== "function") {
      s.raw = function raw(on?: boolean) {
        const enabled = on !== false;
        if (typeof s.setReturnArrays === "function") {
          s.setReturnArrays(enabled);
        }
        return s;
      };
    }

    // better-sqlite3 run() returns { changes, lastInsertRowid }
    const originalRun = s.run?.bind(s);
    if (originalRun) {
      s.run = (...params: unknown[]) => {
        const result = originalRun(...params);
        // node:sqlite may return slightly different shape; normalize
        if (result && typeof result === "object") {
          return {
            changes: Number(
              (result as { changes?: number }).changes ?? 0,
            ),
            lastInsertRowid:
              (result as { lastInsertRowid?: number | bigint })
                .lastInsertRowid ?? 0,
          };
        }
        return { changes: 0, lastInsertRowid: 0 };
      };
    }

    return s;
  };

  // drizzle transaction() expects better-sqlite3 style .transaction(fn)[behavior](tx)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (sqlite as any).transaction !== "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sqlite as any).transaction = (fn: (tx: unknown) => unknown) => {
      const runner = {
        deferred: (tx: unknown) => {
          sqlite.exec("BEGIN");
          try {
            const result = fn(tx);
            sqlite.exec("COMMIT");
            return result;
          } catch (e) {
            sqlite.exec("ROLLBACK");
            throw e;
          }
        },
        immediate: (tx: unknown) => runner.deferred(tx),
        exclusive: (tx: unknown) => runner.deferred(tx),
      };
      return runner;
    };
  }
  return sqlite;
}

function ensureSchema(sqlite: DatabaseSync) {
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      kyc_status TEXT NOT NULL DEFAULT 'none',
      status TEXT NOT NULL DEFAULT 'active',
      avatar_url TEXT,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_balances (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      available_cents INTEGER NOT NULL DEFAULT 0,
      locked_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      asset TEXT NOT NULL DEFAULT 'USD',
      ref_type TEXT,
      ref_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ledger_user_created_idx ON ledger_entries(user_id, created_at);

    CREATE TABLE IF NOT EXISTS investment_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      min_investment_cents INTEGER NOT NULL,
      apy_min_bps INTEGER NOT NULL,
      apy_max_bps INTEGER NOT NULL,
      lockup_days INTEGER NOT NULL,
      risk_tier TEXT NOT NULL,
      accepted_assets TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT,
      target_raise_cents INTEGER NOT NULL,
      raised_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'live',
      expected_apy_bps INTEGER NOT NULL,
      featured INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_investments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT NOT NULL REFERENCES investment_plans(id),
      property_id TEXT REFERENCES properties(id),
      principal_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      matures_at TEXT NOT NULL,
      roi_to_date_cents INTEGER NOT NULL DEFAULT 0,
      last_accrued_at TEXT,
      effective_apy_bps INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS investments_user_idx ON user_investments(user_id);

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      asset TEXT NOT NULL DEFAULT 'USDT',
      status TEXT NOT NULL DEFAULT 'pending',
      tx_ref TEXT,
      meta TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tx_user_created_idx ON transactions(user_id, created_at);

    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      investment_id TEXT REFERENCES user_investments(id),
      payout_type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      withdrawal_address TEXT,
      withdrawal_asset TEXT,
      withdrawal_network TEXT,
      scheduled_at TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      completed_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payouts_status_idx ON payouts(status);

    CREATE TABLE IF NOT EXISTS kyc_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      full_legal_name TEXT,
      date_of_birth TEXT,
      country TEXT,
      document_type TEXT,
      document_number TEXT,
      document_paths TEXT NOT NULL DEFAULT '[]',
      reviewer_note TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS kyc_status_idx ON kyc_submissions(status);

    CREATE TABLE IF NOT EXISTS faq_entries (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS documents_meta (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      body_override TEXT,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'info',
      read_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications(user_id);

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'guide',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referral_rewards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      from_user_id TEXT REFERENCES users(id),
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_value_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      as_of TEXT NOT NULL,
      value_cents INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pvs_user_asof_idx ON portfolio_value_snapshots(user_id, as_of);

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id TEXT PRIMARY KEY,
      asset TEXT NOT NULL,
      price_usd_cents INTEGER NOT NULL,
      as_of TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_stats_daily (
      id TEXT PRIMARY KEY,
      as_of TEXT NOT NULL UNIQUE,
      total_invested_cents INTEGER NOT NULL,
      avg_roi_bps INTEGER NOT NULL,
      properties_funded INTEGER NOT NULL,
      active_users INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      meta TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS default_portfolio_rates (
      tier TEXT PRIMARY KEY,
      min_invested_cents INTEGER NOT NULL,
      max_invested_cents INTEGER,
      apy_min_bps INTEGER NOT NULL,
      apy_max_bps INTEGER NOT NULL,
      current_apy_bps INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      from_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      body_text TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      meta TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON email_outbox(status);
  `);

  // Additive migrations for existing local DBs
  const alters = [
    "ALTER TABLE payouts ADD COLUMN withdrawal_address TEXT",
    "ALTER TABLE payouts ADD COLUMN withdrawal_asset TEXT",
    "ALTER TABLE payouts ADD COLUMN withdrawal_network TEXT",
    "ALTER TABLE payouts ADD COLUMN completed_at TEXT",
    "ALTER TABLE kyc_submissions ADD COLUMN full_legal_name TEXT",
    "ALTER TABLE kyc_submissions ADD COLUMN date_of_birth TEXT",
    "ALTER TABLE kyc_submissions ADD COLUMN country TEXT",
    "ALTER TABLE kyc_submissions ADD COLUMN document_type TEXT",
    "ALTER TABLE kyc_submissions ADD COLUMN document_number TEXT",
    "ALTER TABLE user_investments ADD COLUMN last_accrued_at TEXT",
    "ALTER TABLE user_investments ADD COLUMN effective_apy_bps INTEGER",
    "ALTER TABLE properties ADD COLUMN featured INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE properties ADD COLUMN updated_at TEXT",
    "ALTER TABLE users ADD COLUMN lockup_days INTEGER NOT NULL DEFAULT 0",
  ];
  for (const sql of alters) {
    try {
      sqlite.exec(sql);
    } catch {
      // column already exists
    }
  }

  seedDefaultPlatformData(sqlite);
}

function seedDefaultPlatformData(sqlite: DatabaseSync) {
  const now = new Date().toISOString();
  const defaults: [string, string][] = [
    ["deposit_wallet_USDT", "0xQUIDMOTION_USDT_REPLACE_ME"],
    ["deposit_wallet_USDC", "0xQUIDMOTION_USDC_REPLACE_ME"],
    ["deposit_wallet_BTC", "bc1qquidmotion_btc_replace_me"],
    ["deposit_wallet_ETH", "0xQUIDMOTION_ETH_REPLACE_ME"],
    ["deposit_network_USDT", "Ethereum (ERC-20)"],
    ["deposit_network_USDC", "Ethereum (ERC-20)"],
    ["deposit_network_BTC", "Bitcoin"],
    ["deposit_network_ETH", "Ethereum"],
    ["email_contact", "contact@quidmotion.com"],
    ["email_support", "support@quidmotion.com"],
    ["email_noreply", "noreply@quidmotion.com"],
  ];
  for (const [key, value] of defaults) {
    sqlite.prepare(
      `INSERT OR IGNORE INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)`,
    ).run(key, value, now);
  }

  const tiers: [string, number, number | null, number, number, number][] = [
    ["tier_500", 50_000, 250_000, 2000, 2500, 2250],
    ["tier_2500", 250_000, 1_000_000, 4500, 5000, 4750],
    ["tier_10000", 1_000_000, null, 6000, 7000, 6500],
  ];
  for (const [tier, minC, maxC, minBps, maxBps, cur] of tiers) {
    sqlite.prepare(
      `INSERT OR IGNORE INTO default_portfolio_rates
        (tier, min_invested_cents, max_invested_cents, apy_min_bps, apy_max_bps, current_apy_bps, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(tier, minC, maxC, minBps, maxBps, cur, now);
  }
}

export function createLocalAdapter(): DbAdapter {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const raw = new DatabaseSync(dbPath);
  const sqlite = wrapClient(raw);
  ensureSchema(sqlite);
  // Duck-type node:sqlite as better-sqlite3 client for drizzle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = drizzle({ client: sqlite as any, schema });
  return {
    provider: "local",
    db,
    close: async () => {
      raw.close();
    },
  };
}
