-- QuidMotion production (Supabase Postgres) migration
-- 1) Internal P2P transfers schema
-- 2) Expand ledger / transaction type checks
-- 3) KYC documents bucket (run Storage section in SQL editor or Dashboard)

-- ---------- internal_transfers ----------
CREATE TABLE IF NOT EXISTS internal_transfers (
  id            TEXT PRIMARY KEY,
  from_user_id  TEXT NOT NULL REFERENCES users(id),
  to_user_id    TEXT NOT NULL REFERENCES users(id),
  amount_cents  BIGINT NOT NULL,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('completed', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS internal_transfers_from_idx
  ON internal_transfers(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS internal_transfers_to_idx
  ON internal_transfers(to_user_id, created_at DESC);

-- ---------- expand ledger_entries.type ----------
-- Drop existing check if present (name may vary; recreate safely)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'ledger_entries'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ledger_entries DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_type_check CHECK (type IN (
    'deposit','subscribe','withdraw','payout','refund',
    'referral_reward','adjustment','yield',
    'transfer_out','transfer_in'
  ));

-- ---------- expand transactions.type ----------
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%type%IN%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE transactions DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN (
    'deposit','withdraw','invest','payout','fee','reward','yield','transfer'
  ));

-- ---------- KYC Storage bucket (private) ----------
-- Requires storage schema (Supabase). Safe to re-run.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  8388608,
  ARRAY[
    'image/png','image/jpeg','image/webp','image/gif',
    'image/heic','image/heif','application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- App uses SUPABASE_SERVICE_ROLE_KEY for upload/download (local auth, not Supabase Auth).
-- Optional: deny public access is default for private buckets.
;