const postgres = require('postgres');

const projectRef = 'obcssaddhwwybtdwvggz';
const user = `postgres.${projectRef}`;
const password = '@#@101010Work%';
const database = 'postgres';

const poolers = [
  'aws-0-eu-west-1.pooler.supabase.com',
  'aws-0-eu-west-2.pooler.supabase.com',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-eu-north-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-us-west-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com',
];

async function testHost(host, port) {
  const sql = postgres({
    host,
    port,
    user,
    password,
    database,
    ssl: 'require',
    connect_timeout: 5
  });

  try {
    const res = await sql`SELECT version();`;
    console.log(`\n🎉 SUCCESS! Connected to ${host}:${port}`);
    console.log('PostgreSQL Version:', res[0].version);
    return true;
  } catch (err) {
    console.log(`Failed ${host}:${port} -> ${err.message}`);
    return false;
  } finally {
    await sql.end().catch(() => {});
  }
}

async function run() {
  for (const host of poolers) {
    for (const port of [6543, 5432]) {
      const ok = await testHost(host, port);
      if (ok) process.exit(0);
    }
  }
  console.log('\nDirect user fallback test:');
  const sqlDirect = postgres({
    host: 'db.obcssaddhwwybtdwvggz.supabase.co',
    port: 5432,
    user: 'postgres',
    password,
    database,
    ssl: 'require',
    connect_timeout: 5
  });
  try {
    const res = await sqlDirect`SELECT version();`;
    console.log('Direct host success:', res[0].version);
  } catch (e) {
    console.log('Direct host failed:', e.message);
  } finally {
    await sqlDirect.end().catch(() => {});
  }
}

run();
