-- Explicit grants for Supabase Data API roles.
-- New projects, preview branches, and `supabase db reset` do not keep
-- the old default privileges. Without a GRANT, supabase-js, PostgREST,
-- and GraphQL return "permission denied" and include the statement to run.
--
-- QuidMotion's app server connects as the table owner (session pooler),
-- so it does not need these grants. The Data API does.
--
-- anon and authenticated are intentionally not granted. These tables hold
-- balances, KYC, sessions, and support transcripts. RLS is not a substitute
-- for withholding the grant when there is no policy yet.
-- service_role bypasses RLS and is the only API role that may touch them.

GRANT USAGE ON SCHEMA public TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      r.tablename
    );
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
