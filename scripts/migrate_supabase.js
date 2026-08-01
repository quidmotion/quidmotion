const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const config = {
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432, // Session pooler port for DDL migrations
  user: 'postgres.obcssaddhwwybtdwvggz',
  password: '@#@101010Work%',
  database: 'postgres',
  ssl: 'require'
};

const sql = postgres(config);

async function runMigration() {
  console.log('🚀 Starting Supabase schema deployment...');

  const migrationPath = path.join(__dirname, '../MIGRATION_INSTRUCTIONS.md');
  const fileContent = fs.readFileSync(migrationPath, 'utf8');

  // Extract SQL from section 4
  const sqlMatch = fileContent.match(/```sql([\s\S]*?)```/);
  if (!sqlMatch) {
    console.error('❌ Could not find SQL block in MIGRATION_INSTRUCTIONS.md');
    process.exit(1);
  }

  const ddlSql = sqlMatch[1];
  console.log('📝 Extracted DDL SQL. Executing queries...');

  try {
    // Execute DDL SQL statements
    await sql.unsafe(ddlSql);
    console.log('✅ Base schema & tables successfully created on Supabase!');

    // Extract RLS policies from section 5
    const rlsMatch = fileContent.match(/## 5\. Row Level Security[\s\S]*?```sql([\s\S]*?)```/);
    if (rlsMatch) {
      console.log('🔒 Applying RLS policies...');
      await sql.unsafe(rlsMatch[1]);
      console.log('✅ RLS policies successfully applied!');
    }

    // Verify created tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    console.log('\n📋 Applied Tables in Supabase public schema:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));

    console.log(`\n🎉 MIGRATION SUCCESSFUL! Total tables: ${tables.length}`);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
