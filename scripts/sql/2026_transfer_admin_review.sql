-- QuidMotion: admin review for internal balance transfers
-- Run on Supabase/Postgres when DB_PROVIDER=supabase

ALTER TABLE internal_transfers ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE internal_transfers ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE internal_transfers ADD COLUMN IF NOT EXISTS reviewer_note TEXT;

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'internal_transfers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE internal_transfers DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE internal_transfers
  ADD CONSTRAINT internal_transfers_status_check
  CHECK (status IN ('pending_approval', 'completed', 'rejected', 'failed'));

ALTER TABLE internal_transfers
  ALTER COLUMN status SET DEFAULT 'pending_approval';

CREATE INDEX IF NOT EXISTS internal_transfers_status_idx
  ON internal_transfers(status);
