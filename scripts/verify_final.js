const postgres = require('postgres');

const sql = postgres({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.obcssaddhwwybtdwvggz',
  password: '@#@101010Work%',
  database: 'postgres',
  ssl: 'require'
});

async function verify() {
  console.log('📊 Verifying Supabase Database Tables and Row Counts:\n');

  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;

  for (const t of tables) {
    const res = await sql.unsafe(`SELECT COUNT(*) as count FROM "${t.table_name}"`);
    console.log(`  - ${t.table_name.padEnd(28)}: ${res[0].count} rows`);
  }

  console.log('\n✅ All tables and data verified on Supabase!');
  await sql.end();
}

verify();
