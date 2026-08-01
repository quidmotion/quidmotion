# QuidMotion: Full Database Migration Guide (Local SQLite → Supabase)

This document is the **step-by-step production playbook** for moving QuidMotion from the local SQLite database (`data/quidmotion.db`) to **Supabase (PostgreSQL)**, including complete SQL, data export/import, RLS, storage, auth, email, cron, and verification tests.

> **Current state:** The app still runs on local SQLite (`DB_PROVIDER=local`). All live product features (KYC, wallets, prices, growth, withdrawals, emails, properties) write to the local DB. Supabase is the next infrastructure step — not required for local development.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Inventory of local tables](#2-inventory-of-local-tables)
3. [Create the Supabase project](#3-create-the-supabase-project)
4. [PostgreSQL schema (full SQL)](#4-postgresql-schema-full-sql)
5. [Row Level Security (RLS)](#5-row-level-security-rls)
6. [Storage for KYC documents](#6-storage-for-kyc-documents)
7. [Export data from SQLite](#7-export-data-from-sqlite)
8. [Import data into Supabase](#8-import-data-into-supabase)
9. [Application code switchover](#9-application-code-switchover)
10. [Auth migration (local → Supabase Auth)](#10-auth-migration-local--supabase-auth)
11. [Email, prices, and hourly growth cron](#11-email-prices-and-hourly-growth-cron)
12. [Environment variables](#12-environment-variables)
13. [Verification tests](#13-verification-tests)
14. [Rollback plan](#14-rollback-plan)
15. [Post-migration checklist](#15-post-migration-checklist)
16. [Appendix: drizzle PG schema sketch](#16-appendix-drizzle-pg-schema-sketch)

---

## 1. Prerequisites

### Tools

| Tool | Purpose |
|------|---------|
| Node.js 20+ | App runtime (`node --experimental-sqlite` for local) |
| npm | Dependencies |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | Local/remote migrations |
| [psql](https://www.postgresql.org/docs/current/app-psql.html) | Run SQL against Supabase |
| sqlite3 CLI (optional) | Inspect/export local DB |
| [Resend](https://resend.com) account (optional) | Transactional email |

### Accounts & secrets you will need

- Supabase project URL  
- Supabase **anon** key  
- Supabase **service role** key (server only — never expose to the browser)  
- Postgres connection string (`DATABASE_URL`)  
- Existing `SESSION_SECRET` (or rotate deliberately)  
- Optional: `RESEND_API_KEY`, `CRON_SECRET`

### Pre-flight on local

```bash
# From repo root
npm install
npm run db:seed
npm run typecheck
npm run dev
```

Confirm:

- [ ] Login works: `investor@quidmotion.com` / `password123`
- [ ] Admin works: `admin@quidmotion.com` / `password123`
- [ ] Deposit → invest → withdraw path works on local
- [ ] Admin can edit wallets, emails, properties
- [ ] `data/quidmotion.db` exists and is the source of truth

**Take a backup before any migration:**

```bash
# Windows PowerShell
Copy-Item .\data\quidmotion.db .\data\quidmotion.backup.$(Get-Date -Format yyyyMMddHHmmss).db

# macOS/Linux
cp data/quidmotion.db "data/quidmotion.backup.$(date +%Y%m%d%H%M%S).db"
```

---

## 2. Inventory of local tables

These tables are created by `lib/db/adapters/local.ts` and declared in `lib/db/schema/schema.sqlite.ts`:

| Table | Purpose |
|-------|---------|
| `users` | Accounts, roles, KYC status |
| `sessions` | Server sessions (local auth) |
| `password_reset_tokens` | Password reset |
| `user_balances` | Available + locked cents |
| `ledger_entries` | Double-entry style cash movements |
| `investment_plans` | Starter / Growth / Elite lock-up plans |
| `properties` | Featured real-estate deals |
| `user_investments` | Positions + ROI + accrual timestamps |
| `transactions` | User-visible tx history |
| `payouts` | Withdrawals: `pending_approval` → `processing` → `completed` |
| `kyc_submissions` | Live KYC identity + document paths |
| `faq_entries` | FAQ CMS |
| `documents_meta` | Legal doc metadata / overrides |
| `notifications` | In-app alerts |
| `leads` | Lead magnet emails |
| `referral_rewards` | Referral credits |
| `portfolio_value_snapshots` | Chart series |
| `price_snapshots` | BTC/ETH/USDT/USDC cache |
| `platform_stats_daily` | Marketing stats |
| `audit_events` | Admin audit log |
| `platform_settings` | Deposit wallets + official emails |
| `default_portfolio_rates` | Hourly default APY by invest tier |
| `email_outbox` | Transactional email log |

**Money convention:** all amounts are **integer USD cents**. Never store floats for money.

---

## 3. Create the Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Choose region closest to users; set a strong DB password; save it in a password manager.
3. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
4. In **Project Settings → Database**, copy the connection string:
   - URI mode: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - Prefer **Transaction pooler** for serverless (port 6543) and **Session** mode for migrations (port 5432).

Install CLI and link:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

Create a migrations folder in the repo (if not present):

```bash
mkdir -p supabase/migrations
```

---

## 4. PostgreSQL schema (full SQL)

Save as `supabase/migrations/20260101000000_init_quidmotion.sql` and apply with:

```bash
supabase db push
# or
psql "$DATABASE_URL_SESSION" -f supabase/migrations/20260101000000_init_quidmotion.sql
```

```sql
-- ============================================================
-- QuidMotion core schema (PostgreSQL / Supabase)
-- Amounts: integer cents. Timestamps: timestamptz ISO-compatible.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,          -- use Supabase auth.users.id in prod
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT,                      -- NULL when using Supabase Auth
  role          TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'admin', 'support')),
  kyc_status    TEXT NOT NULL DEFAULT 'none'
                  CHECK (kyc_status IN ('none', 'pending', 'approved', 'rejected')),
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended')),
  avatar_url    TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- sessions (optional if fully on Supabase Auth) ----------
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- balances & ledger ----------
CREATE TABLE IF NOT EXISTS user_balances (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available_cents BIGINT NOT NULL DEFAULT 0,
  locked_cents    BIGINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_balances_nonneg CHECK (available_cents >= 0 AND locked_cents >= 0)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  type         TEXT NOT NULL CHECK (type IN (
                  'deposit','subscribe','withdraw','payout','refund',
                  'referral_reward','adjustment','yield'
                )),
  amount_cents BIGINT NOT NULL,
  asset        TEXT NOT NULL DEFAULT 'USD',
  ref_type     TEXT,
  ref_id       TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user_created_idx ON ledger_entries(user_id, created_at DESC);

-- ---------- plans & properties ----------
CREATE TABLE IF NOT EXISTS investment_plans (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  description           TEXT NOT NULL,
  min_investment_cents  BIGINT NOT NULL,
  apy_min_bps           INTEGER NOT NULL,
  apy_max_bps           INTEGER NOT NULL,
  lockup_days           INTEGER NOT NULL,
  risk_tier             TEXT NOT NULL CHECK (risk_tier IN ('low','medium','high')),
  accepted_assets       TEXT NOT NULL, -- JSON array string
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','archived')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  location           TEXT NOT NULL,
  description        TEXT NOT NULL,
  image_url          TEXT,
  target_raise_cents BIGINT NOT NULL,
  raised_cents       BIGINT NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'live'
                       CHECK (status IN ('draft','live','funded','closed')),
  expected_apy_bps   INTEGER NOT NULL,
  featured           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_investments (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  plan_id            TEXT NOT NULL REFERENCES investment_plans(id),
  property_id        TEXT REFERENCES properties(id),
  principal_cents    BIGINT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','maturing','completed','cancelled')),
  started_at         TIMESTAMPTZ NOT NULL,
  matures_at         TIMESTAMPTZ NOT NULL,
  roi_to_date_cents  BIGINT NOT NULL DEFAULT 0,
  last_accrued_at    TIMESTAMPTZ,
  effective_apy_bps  INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investments_user_idx ON user_investments(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  type         TEXT NOT NULL CHECK (type IN (
                  'deposit','withdraw','invest','payout','fee','reward','yield'
                )),
  amount_cents BIGINT NOT NULL,
  asset        TEXT NOT NULL DEFAULT 'USDT',
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','failed','cancelled')),
  tx_ref       TEXT,
  meta         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tx_user_created_idx ON transactions(user_id, created_at DESC);

-- ---------- payouts / withdrawals ----------
CREATE TABLE IF NOT EXISTS payouts (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id),
  investment_id       TEXT REFERENCES user_investments(id),
  payout_type         TEXT NOT NULL CHECK (payout_type IN ('withdrawal','distribution')),
  amount_cents        BIGINT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending_approval'
                        CHECK (status IN (
                          'scheduled','pending_approval','processing',
                          'completed','failed','rejected'
                        )),
  withdrawal_address  TEXT,
  withdrawal_asset    TEXT,
  withdrawal_network  TEXT,
  scheduled_at        TIMESTAMPTZ,
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_status_idx ON payouts(status);

-- ---------- KYC ----------
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  full_legal_name  TEXT,
  date_of_birth    TEXT,
  country          TEXT,
  document_type    TEXT,
  document_number  TEXT,
  document_paths   TEXT NOT NULL DEFAULT '[]', -- JSON; after migrate: storage paths
  reviewer_note    TEXT,
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_status_idx ON kyc_submissions(status);

-- ---------- content ----------
CREATE TABLE IF NOT EXISTS faq_entries (
  id         TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS documents_meta (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  body_override TEXT,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'info',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications(user_id);

CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'guide',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  from_user_id   TEXT REFERENCES users(id),
  amount_cents   BIGINT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','credited')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_value_snapshots (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  as_of       TIMESTAMPTZ NOT NULL,
  value_cents BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS pvs_user_asof_idx ON portfolio_value_snapshots(user_id, as_of);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id               TEXT PRIMARY KEY,
  asset            TEXT NOT NULL,
  price_usd_cents  BIGINT NOT NULL,
  as_of            TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS price_asset_asof_idx ON price_snapshots(asset, as_of DESC);

CREATE TABLE IF NOT EXISTS platform_stats_daily (
  id                   TEXT PRIMARY KEY,
  as_of                DATE NOT NULL UNIQUE,
  total_invested_cents BIGINT NOT NULL,
  avg_roi_bps          INTEGER NOT NULL,
  properties_funded    INTEGER NOT NULL,
  active_users         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  meta          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- platform config ----------
CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS default_portfolio_rates (
  tier                TEXT PRIMARY KEY, -- tier_500 | tier_2500 | tier_10000
  min_invested_cents  BIGINT NOT NULL,
  max_invested_cents  BIGINT,           -- NULL = no upper bound
  apy_min_bps         INTEGER NOT NULL,
  apy_max_bps         INTEGER NOT NULL,
  current_apy_bps     INTEGER NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id         TEXT PRIMARY KEY,
  to_email   TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  body_text  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','sent','failed','logged')),
  meta       TEXT,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON email_outbox(status);

-- ---------- seed default rates (safe to re-run) ----------
INSERT INTO default_portfolio_rates
  (tier, min_invested_cents, max_invested_cents, apy_min_bps, apy_max_bps, current_apy_bps, updated_at)
VALUES
  ('tier_500',   50000,   250000, 2000, 2500, 2250, now()),
  ('tier_2500', 250000,  1000000, 4500, 5000, 4750, now()),
  ('tier_10000',1000000,    NULL, 6000, 7000, 6500, now())
ON CONFLICT (tier) DO NOTHING;

INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('deposit_wallet_USDT', 'REPLACE_ME', now()),
  ('deposit_wallet_USDC', 'REPLACE_ME', now()),
  ('deposit_wallet_BTC',  'REPLACE_ME', now()),
  ('deposit_wallet_ETH',  'REPLACE_ME', now()),
  ('deposit_network_USDT','Ethereum (ERC-20)', now()),
  ('deposit_network_USDC','Ethereum (ERC-20)', now()),
  ('deposit_network_BTC', 'Bitcoin', now()),
  ('deposit_network_ETH', 'Ethereum', now()),
  ('email_contact',  'contact@quidmotion.com', now()),
  ('email_support',  'support@quidmotion.com', now()),
  ('email_noreply',  'noreply@quidmotion.com', now())
ON CONFLICT (key) DO NOTHING;
```

### Optional helper: updated_at trigger

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 5. Row Level Security (RLS)

Apply after schema. **Service role bypasses RLS**; the Next.js server should use the service role for admin/ledger writes, while browser clients (if any) use anon + user JWT.

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_value_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Helper: is current JWT an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()::text
      AND u.role = 'admin'
      AND u.status = 'active'
  );
$$;

-- users: read self; admin read all
CREATE POLICY users_select_self ON users
  FOR SELECT USING (id = auth.uid()::text OR public.is_admin());

CREATE POLICY users_update_self ON users
  FOR UPDATE USING (id = auth.uid()::text OR public.is_admin());

-- balances
CREATE POLICY bal_select ON user_balances
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

-- ledger, investments, tx, payouts, kyc, notifications, snapshots
CREATE POLICY ledger_select ON ledger_entries
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

CREATE POLICY inv_select ON user_investments
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

CREATE POLICY tx_select ON transactions
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

CREATE POLICY payouts_select ON payouts
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

CREATE POLICY kyc_select ON kyc_submissions
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

CREATE POLICY notif_select ON notifications
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

CREATE POLICY pvs_select ON portfolio_value_snapshots
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

-- Public read for marketing-ish tables (adjust as needed)
ALTER TABLE investment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_public_read ON investment_plans
  FOR SELECT USING (status = 'active' OR public.is_admin());

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY props_public_read ON properties
  FOR SELECT USING (
    (status IN ('live','funded') AND featured = TRUE) OR public.is_admin()
  );

ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY prices_public_read ON price_snapshots
  FOR SELECT USING (TRUE);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_admin_all ON platform_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- IMPORTANT: do NOT grant INSERT/UPDATE on ledger/balances to authenticated users from the client.
-- All money mutations go through Next.js server actions with SUPABASE_SERVICE_ROLE_KEY.
```

**Security rule:** keep service-layer authz (`lib/services/_authz.ts`) even with RLS. Defense in depth.

---

## 6. Storage for KYC documents

Local files live under `data/uploads/kyc/{userId}/…` and are served by `/api/uploads/...`.

### Create bucket

```sql
-- In Supabase SQL editor or via dashboard Storage UI
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  8388608, -- 8MB
  ARRAY['image/png','image/jpeg','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;
```

### Storage policies

```sql
-- Users upload only into their own folder: kyc/{userId}/...
CREATE POLICY kyc_upload_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY kyc_read_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );
```

### Upload existing local files

```bash
# Example using Supabase CLI / script
# For each file under data/uploads/kyc/<userId>/<file>:
#   supabase storage cp ./data/uploads/kyc/<userId>/<file> \
#     ss://kyc-documents/<userId>/<file> --experimental
```

Then update `kyc_submissions.document_paths` JSON from `kyc/userId/file` to storage object keys.

Application change after migrate: replace `kyc.saveKycFile` disk writes with Supabase Storage upload; replace `/api/uploads` with signed URLs.

---

## 7. Export data from SQLite

### Option A — CSV per table (recommended for first migration)

```bash
# Requires sqlite3 CLI
mkdir -p tmp/export

sqlite3 -header -csv data/quidmotion.db "SELECT * FROM users;" > tmp/export/users.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM user_balances;" > tmp/export/user_balances.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM ledger_entries;" > tmp/export/ledger_entries.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM investment_plans;" > tmp/export/investment_plans.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM properties;" > tmp/export/properties.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM user_investments;" > tmp/export/user_investments.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM transactions;" > tmp/export/transactions.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM payouts;" > tmp/export/payouts.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM kyc_submissions;" > tmp/export/kyc_submissions.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM faq_entries;" > tmp/export/faq_entries.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM documents_meta;" > tmp/export/documents_meta.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM notifications;" > tmp/export/notifications.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM leads;" > tmp/export/leads.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM referral_rewards;" > tmp/export/referral_rewards.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM portfolio_value_snapshots;" > tmp/export/portfolio_value_snapshots.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM price_snapshots;" > tmp/export/price_snapshots.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM platform_stats_daily;" > tmp/export/platform_stats_daily.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM audit_events;" > tmp/export/audit_events.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM platform_settings;" > tmp/export/platform_settings.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM default_portfolio_rates;" > tmp/export/default_portfolio_rates.csv
sqlite3 -header -csv data/quidmotion.db "SELECT * FROM email_outbox;" > tmp/export/email_outbox.csv
# sessions / password_reset_tokens: usually skip (force re-login)
```

### Option B — Node export script

Create `scripts/export-sqlite-json.ts` (run with `node --experimental-sqlite --import tsx`):

```ts
/**
 * Example outline — expand as needed.
 * Reads each table via drizzle getDb() and writes tmp/export/*.json
 */
import fs from "node:fs";
import path from "node:path";
// import { createLocalAdapter } from "../lib/db/adapters/local";
// import { schema } from "../lib/db/schema";
// const adapter = createLocalAdapter();
// for (const [name, table] of Object.entries(schema)) {
//   const rows = adapter.db.select().from(table).all();
//   fs.writeFileSync(`tmp/export/${name}.json`, JSON.stringify(rows, null, 2));
// }
```

### Data transforms before import

| SQLite | Postgres |
|--------|----------|
| `TEXT` ISO timestamps | Cast to `timestamptz` |
| `INTEGER` 0/1 booleans (`published`, `featured`) | `BOOLEAN` |
| `INTEGER` cents | `BIGINT` |
| Payout status `approved`/`sent` (legacy) | Map → `processing` / `completed` |
| `password_hash` | Keep for hybrid, or null after Auth migrate |

Legacy status remap SQL (if needed):

```sql
UPDATE payouts SET status = 'processing' WHERE status IN ('approved');
UPDATE payouts SET status = 'completed'  WHERE status IN ('sent');
```

---

## 8. Import data into Supabase

### Using `\copy` (psql)

```bash
# Use SESSION (non-pooler) connection for bulk load
export DATABASE_URL_SESSION="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"

psql "$DATABASE_URL_SESSION" <<'SQL'
-- Disable triggers if any; import in FK order
\copy users FROM 'tmp/export/users.csv' CSV HEADER
\copy user_balances from 'tmp/export/user_balances.csv' CSV HEADER
\copy investment_plans from 'tmp/export/investment_plans.csv' CSV HEADER
\copy properties from 'tmp/export/properties.csv' CSV HEADER
\copy user_investments from 'tmp/export/user_investments.csv' CSV HEADER
\copy ledger_entries from 'tmp/export/ledger_entries.csv' CSV HEADER
\copy transactions from 'tmp/export/transactions.csv' CSV HEADER
\copy payouts from 'tmp/export/payouts.csv' CSV HEADER
\copy kyc_submissions from 'tmp/export/kyc_submissions.csv' CSV HEADER
\copy faq_entries from 'tmp/export/faq_entries.csv' CSV HEADER
\copy documents_meta from 'tmp/export/documents_meta.csv' CSV HEADER
\copy notifications from 'tmp/export/notifications.csv' CSV HEADER
\copy leads from 'tmp/export/leads.csv' CSV HEADER
\copy referral_rewards from 'tmp/export/referral_rewards.csv' CSV HEADER
\copy portfolio_value_snapshots from 'tmp/export/portfolio_value_snapshots.csv' CSV HEADER
\copy price_snapshots from 'tmp/export/price_snapshots.csv' CSV HEADER
\copy platform_stats_daily from 'tmp/export/platform_stats_daily.csv' CSV HEADER
\copy audit_events from 'tmp/export/audit_events.csv' CSV HEADER
\copy platform_settings from 'tmp/export/platform_settings.csv' CSV HEADER
\copy default_portfolio_rates from 'tmp/export/default_portfolio_rates.csv' CSV HEADER
\copy email_outbox from 'tmp/export/email_outbox.csv' CSV HEADER
SQL
```

### Import order (FK-safe)

1. `users`  
2. `user_balances`, `investment_plans`, `properties`, `platform_settings`, `default_portfolio_rates`  
3. `user_investments`, `ledger_entries`, `transactions`, `payouts`, `kyc_submissions`  
4. Everything else  

### Row-count reconciliation

```sql
-- Run on BOTH sqlite (via script) and postgres; numbers must match
SELECT 'users' AS t, COUNT(*) FROM users
UNION ALL SELECT 'user_balances', COUNT(*) FROM user_balances
UNION ALL SELECT 'ledger_entries', COUNT(*) FROM ledger_entries
UNION ALL SELECT 'user_investments', COUNT(*) FROM user_investments
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'payouts', COUNT(*) FROM payouts
UNION ALL SELECT 'kyc_submissions', COUNT(*) FROM kyc_submissions
UNION ALL SELECT 'platform_settings', COUNT(*) FROM platform_settings;
```

### Balance integrity check

```sql
-- available + locked should equal sum of ledger for each user (if ledger is complete)
SELECT
  b.user_id,
  b.available_cents,
  b.locked_cents,
  COALESCE(SUM(l.amount_cents), 0) AS ledger_sum_available_effect
FROM user_balances b
LEFT JOIN ledger_entries l ON l.user_id = b.user_id
GROUP BY b.user_id, b.available_cents, b.locked_cents;
-- Manually review: subscribe locks principal; yield credits available; etc.
```

---

## 9. Application code switchover

### 9.1 Install Postgres client

```bash
npm install postgres drizzle-orm @supabase/supabase-js
# drizzle-orm already present; postgres driver for drizzle-orm/postgres-js
```

### 9.2 Implement `lib/db/schema/schema.pg.ts`

Mirror `schema.sqlite.ts` using `drizzle-orm/pg-core` (`pgTable`, `text`, `bigint`, `boolean`, `timestamp`).

Point `lib/db/schema/index.ts`:

```ts
// Example
const provider = process.env.DB_PROVIDER ?? "local";
export * from provider === "supabase" ? "./schema.pg" : "./schema.sqlite";
```

> Note: dual export is awkward with TypeScript pathing; preferred pattern is one active schema module selected at build time, or shared column defs.

### 9.3 Complete `lib/db/adapters/supabase.ts`

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "../schema";
import type { DbAdapter } from "../types";

export function createSupabaseAdapter(): DbAdapter {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const client = postgres(url, { prepare: false }); // pooler-friendly
  const db = drizzle(client, { schema });
  return {
    provider: "supabase",
    db: db as unknown as DbAdapter["db"],
    close: async () => { await client.end(); },
  };
}
```

### 9.4 Flip env

```env
DB_PROVIDER=supabase
DATABASE_URL=postgresql://...
```

Keep `DB_PROVIDER=local` on developer machines.

### 9.5 Dialects & API differences

| Local SQLite (drizzle) | Postgres |
|------------------------|----------|
| `.get()` / `.all()` / `.run()` | Often need `.limit(1)` + await if async driver |
| Sync `node:sqlite` | Async `postgres` — **services must become async** |

**Critical:** today’s local adapter is **synchronous**. Moving to Supabase requires making service functions `async` and awaiting queries, or using a sync-incompatible pattern. Plan a dedicated PR to async-ify `lib/services/*` before flipping production traffic.

---

## 10. Auth migration (local → Supabase Auth)

### Goal

`users.id` **equals** `auth.users.id` (UUID from Supabase).

### Steps

1. Implement `lib/auth/adapters/supabase.ts` using `@supabase/supabase-js` (cookie session or SSR helpers).
2. For each local user, create Auth user:

```ts
// Admin API (service role) — run once offline
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// For each exported user:
await admin.auth.admin.createUser({
  email: user.email,
  email_confirm: true,
  password: crypto.randomUUID() + "A1!", // force reset, or set known temp
  user_metadata: { name: user.name },
});
// Map returned id → update public.users.id (and all FKs) OR insert users with that id
```

3. Prefer **export without password hashes** and force password-reset emails.
4. Set `AUTH_PROVIDER=supabase`.
5. Edge middleware: validate Supabase JWT instead of local sealed cookie (or keep dual during transition).

### Admin role claim (optional)

Store `role` in `app_metadata` so RLS/`is_admin` can also read JWT:

```sql
-- Or keep role only in public.users (current is_admin() function)
```

---

## 11. Email, prices, and hourly growth cron

### Email

- Local: logs to `data/emails/` + `email_outbox`
- Production: set `RESEND_API_KEY` and verify domain for `noreply@yourdomain`
- Update admin **Settings → Official emails** after cutover

### Live prices

- Already uses CoinGecko via `/api/prices`
- Cron can hit `/api/cron/growth` which also refreshes prices

### Hourly growth

Vercel cron example (`vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron/growth",
      "schedule": "0 * * * *"
    }
  ]
}
```

Secure with:

```env
CRON_SECRET=long-random
```

Request:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your.app/api/cron/growth
```

What the job does:

1. Randomize `default_portfolio_rates.current_apy_bps` within each tier band  
2. Accrue yield on active investments (principal only × lock-up multiplier)  
3. Refresh price snapshots  

---

## 12. Environment variables

Production `.env` (never commit):

```env
DB_PROVIDER=supabase
AUTH_PROVIDER=supabase
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres

NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

SESSION_SECRET=still-useful-if-hybrid-seal
SESSION_TTL_DAYS=7

NEXT_PUBLIC_SITE_URL=https://app.quidmotion.com
NEXT_PUBLIC_SITE_NAME=QuidMotion

FF_LIVE_CRYPTO_PRICES=true
PRICE_SOURCE=live
FF_REFERRALS=true
FF_LEAD_MAGNET=true
FF_ADMIN_CMS=true

RESEND_API_KEY=re_...
CRON_SECRET=...
```

---

## 13. Verification tests

### 13.1 SQL smoke tests

```sql
-- 1. Schema exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY 1;

-- 2. Default rates present
SELECT * FROM default_portfolio_rates ORDER BY min_invested_cents;

-- 3. Settings present
SELECT key FROM platform_settings ORDER BY 1;

-- 4. No negative balances
SELECT * FROM user_balances WHERE available_cents < 0 OR locked_cents < 0;

-- 5. Orphan investments
SELECT ui.id FROM user_investments ui
LEFT JOIN users u ON u.id = ui.user_id
WHERE u.id IS NULL;

-- 6. Withdrawal status distribution
SELECT status, COUNT(*) FROM payouts GROUP BY status;

-- 7. KYC status distribution
SELECT kyc_status, COUNT(*) FROM users GROUP BY kyc_status;
```

### 13.2 Application acceptance tests (manual / Playwright)

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Register new user | Row in `users` + `user_balances` 0/0 |
| T2 | Submit live KYC with docs | `kyc_submissions` pending; user `kyc_status=pending`; email outbox row |
| T3 | Admin approves KYC | user approved; email sent |
| T4 | Admin sets deposit wallets | `platform_settings` updated; deposit page shows addresses |
| T5 | User confirms deposit $1,000 USDT | balance +100000; ledger deposit; email |
| T6 | Subscribe $2,500 Growth (180d) | available−, locked+; investment row; email |
| T7 | Growth accrual (force cron) | `roi_to_date_cents`↑; available↑; rates `updated_at` fresh |
| T8 | Withdraw without KYC | 403 KYC_REQUIRED |
| T9 | Withdraw with address | status `pending_approval`; funds deducted; email |
| T10 | Admin approve | status `processing`; address visible |
| T11 | Admin complete | status `completed`; email |
| T12 | Admin reject | status `rejected`; funds refunded |
| T13 | Admin add property | appears on `/dashboard/properties` |
| T14 | `/api/prices` | BTC/ETH/USDT/USDC JSON |
| T15 | Admin change emails | subsequent outbox `from_email` matches noreply |

### 13.3 Automated unit-style checks (local before migrate)

```bash
npm run typecheck
npm run db:seed
# Optional: add scripts/test-growth.ts that:
#  - creates user with $10k invested 365d
#  - backdates last_accrued_at by 2 hours
#  - calls accrueUserGrowth
#  - asserts yield > 0
```

Example growth assertion math:

```
principal = 1_000_000 cents ($10,000)
default APY = 65% = 0.65
lockup 365d mult = 1.0
hours = 1
yield ≈ floor(1_000_000 * 0.65 * (1 / 8760)) = floor(74.20) = 74 cents
```

### 13.4 Load / safety

- [ ] Service role key not in client bundles (`next build` + grep)  
- [ ] RLS blocks `authenticated` from updating `user_balances`  
- [ ] KYC storage objects not publicly listable  

---

## 14. Rollback plan

1. Keep SQLite backup + CSV export for 30+ days.  
2. Feature flag / env rollback:

   ```env
   DB_PROVIDER=local
   AUTH_PROVIDER=local
   DB_PATH=./data/quidmotion.backup....db
   ```

3. If dual-write was used, freeze Supabase writes and re-point DNS/app.  
4. Do **not** delete the Supabase project until local parity is confirmed.  
5. Document the cutover timestamp in `audit_events`.

---

## 15. Post-migration checklist

- [ ] Schema applied; RLS on; storage bucket live  
- [ ] Row counts match export  
- [ ] Admin wallets set to **real** treasury addresses  
- [ ] Official emails verified in Resend/DNS (SPF/DKIM)  
- [ ] Cron `/api/cron/growth` runs hourly and is authenticated  
- [ ] Demo passwords rotated or demo users removed in production  
- [ ] `MIGRATION.md` short guide still points here  
- [ ] Monitoring: error tracking on deposit/withdraw/KYC/email failures  
- [ ] Legal docs updated (no longer “mock rails” language)  

---

## 16. Appendix: drizzle PG schema sketch

```ts
// lib/db/schema/schema.pg.ts (sketch)
import {
  pgTable, text, bigint, integer, boolean, timestamp, index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  kycStatus: text("kyc_status").notNull().default("none"),
  status: text("status").notNull().default("active"),
  avatarUrl: text("avatar_url"),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const userBalances = pgTable("user_balances", {
  userId: text("user_id").primaryKey().references(() => users.id),
  availableCents: bigint("available_cents", { mode: "number" }).notNull().default(0),
  lockedCents: bigint("locked_cents", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// ... mirror remaining tables from schema.sqlite.ts
```

---

## Related files in this repo

| File | Role |
|------|------|
| `lib/db/adapters/local.ts` | SQLite schema + additive migrations |
| `lib/db/schema/schema.sqlite.ts` | Drizzle SQLite models |
| `lib/db/adapters/supabase.ts` | Stub until this guide is executed |
| `lib/services/*` | Business logic (provider-agnostic once DB is async) |
| `app/api/cron/growth/route.ts` | Hourly APY + accrual + prices |
| `app/api/prices/route.ts` | Live price JSON |
| `MIGRATION.md` | Short overview (see also this file) |

---

*Last updated for the live-features release: KYC, admin wallets/emails/properties, live prices, tiered portfolio growth with lock-up multipliers, withdrawal workflow (`pending_approval` → `processing` → `completed`), and transactional email outbox.*
