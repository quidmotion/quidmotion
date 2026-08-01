const postgres = require('postgres');

const sql = postgres({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.obcssaddhwwybtdwvggz',
  password: '@#@101010Work%',
  database: 'postgres',
  ssl: 'require'
});

async function fixSecurityAdvisor() {
  console.log('🛡️ Applying fixes for Supabase Security Advisor warnings & suggestions...\n');

  const fixSql = `
    -- 1. Fix mutable search_path on function is_admin
    CREATE OR REPLACE FUNCTION public.is_admin()
    RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()::text
          AND u.role = 'admin'
          AND u.status = 'active'
      );
    $$;

    -- 2 & 3. Revoke public execution permissions on rls_auto_enable helper function if present
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;';
      END IF;
    END $$;

    -- 4. RLS Policies for Public / Marketing tables
    DROP POLICY IF EXISTS faq_public_read ON faq_entries;
    CREATE POLICY faq_public_read ON faq_entries FOR SELECT USING (published = true OR public.is_admin());

    DROP POLICY IF EXISTS docs_public_read ON documents_meta;
    CREATE POLICY docs_public_read ON documents_meta FOR SELECT USING (true);

    DROP POLICY IF EXISTS rates_public_read ON default_portfolio_rates;
    CREATE POLICY rates_public_read ON default_portfolio_rates FOR SELECT USING (true);

    DROP POLICY IF EXISTS stats_public_read ON platform_stats_daily;
    CREATE POLICY stats_public_read ON platform_stats_daily FOR SELECT USING (true);

    -- 5. RLS Policies for User / Admin tables
    DROP POLICY IF EXISTS ref_rewards_select ON referral_rewards;
    CREATE POLICY ref_rewards_select ON referral_rewards FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

    DROP POLICY IF EXISTS sessions_select ON sessions;
    CREATE POLICY sessions_select ON sessions FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

    -- 6. RLS Policies for Server/Admin-only tables
    DROP POLICY IF EXISTS audit_admin_select ON audit_events;
    CREATE POLICY audit_admin_select ON audit_events FOR SELECT USING (public.is_admin());

    DROP POLICY IF EXISTS email_admin_select ON email_outbox;
    CREATE POLICY email_admin_select ON email_outbox FOR SELECT USING (public.is_admin());

    DROP POLICY IF EXISTS leads_admin_select ON leads;
    CREATE POLICY leads_admin_select ON leads FOR SELECT USING (public.is_admin());

    DROP POLICY IF EXISTS pwd_tokens_admin_select ON password_reset_tokens;
    CREATE POLICY pwd_tokens_admin_select ON password_reset_tokens FOR SELECT USING (public.is_admin());
  `;

  try {
    await sql.unsafe(fixSql);
    console.log('✅ ALL SECURITY ADVISOR FIXES APPLIED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Error applying security fixes:', err);
  } finally {
    await sql.end();
  }
}

fixSecurityAdvisor();
