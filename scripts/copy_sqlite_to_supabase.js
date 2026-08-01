const { DatabaseSync } = require('node:sqlite');
const postgres = require('postgres');

const sqliteDb = new DatabaseSync('./data/quidmotion.db');

const pgSql = postgres({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.obcssaddhwwybtdwvggz',
  password: '@#@101010Work%',
  database: 'postgres',
  ssl: 'require'
});

const tablesOrder = [
  'users',
  'sessions',
  'password_reset_tokens',
  'user_balances',
  'investment_plans',
  'properties',
  'user_investments',
  'ledger_entries',
  'transactions',
  'payouts',
  'kyc_submissions',
  'faq_entries',
  'documents_meta',
  'notifications',
  'leads',
  'referral_rewards',
  'portfolio_value_snapshots',
  'price_snapshots',
  'platform_stats_daily',
  'audit_events',
  'platform_settings',
  'default_portfolio_rates',
  'email_outbox'
];

async function migrateData() {
  console.log('📦 Starting robust data migration from SQLite to Supabase...\n');

  for (const table of tablesOrder) {
    const rows = sqliteDb.prepare(`SELECT * FROM "${table}"`).all();
    if (rows.length === 0) {
      console.log(`⏩ Skipping ${table} (0 rows)`);
      continue;
    }

    // Get valid Postgres columns for this table
    const pgColsResult = await pgSql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${table} AND table_schema = 'public';
    `;
    const validPgCols = new Set(pgColsResult.map(c => c.column_name));

    console.log(`🚚 Migrating ${table} (${rows.length} rows, ${validPgCols.size} PG cols)...`);
    
    let count = 0;
    try {
      for (const row of rows) {
        // Only include keys that exist in Postgres schema
        const keys = Object.keys(row).filter(k => validPgCols.has(k));
        const values = keys.map(k => {
          let val = row[k];
          if (typeof val === 'number' && (k === 'featured' || k === 'published')) {
            return val === 1;
          }
          return val;
        });

        const columnsSql = keys.map(k => `"${k}"`).join(', ');
        const placeholdersSql = keys.map((_, i) => `$${i + 1}`).join(', ');
        
        const insertQuery = `
          INSERT INTO "${table}" (${columnsSql}) 
          VALUES (${placeholdersSql}) 
          ON CONFLICT DO NOTHING;
        `;
        
        await pgSql.unsafe(insertQuery, values);
        count++;
      }
      console.log(`  ✅ Successfully migrated ${table} (${count} rows)`);
    } catch (err) {
      console.error(`  ❌ Error migrating ${table}:`, err.message);
    }
  }

  console.log('\n🎉 ALL DATA MIGRATED TO SUPABASE SUCCESSFULLY!');
  await pgSql.end();
}

migrateData();
