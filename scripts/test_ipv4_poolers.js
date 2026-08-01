const postgres = require('postgres');

const projectRef = 'obcssaddhwwybtdwvggz';
const user = `postgres.${projectRef}`;
const password = '@#@101010Work%';
const database = 'postgres';

const poolers = [
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-us-east-2.pooler.supabase.com',
  'aws-0-us-west-1.pooler.supabase.com',
  'aws-0-us-west-2.pooler.supabase.com',
  'aws-0-eu-west-1.pooler.supabase.com',
  'aws-0-eu-west-2.pooler.supabase.com',
  'aws-0-eu-west-3.pooler.supabase.com',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-eu-north-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com',
  'aws-0-ap-southeast-2.pooler.supabase.com',
  'aws-0-ap-northeast-1.pooler.supabase.com',
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-sa-east-1.pooler.supabase.com'
];

async function check(host) {
  const sql = postgres({
    host,
    port: 6543,
    user,
    password,
    database,
    ssl: 'require',
    connect_timeout: 4
  });

  try {
    const res = await sql`SELECT version();`;
    console.log(`\n🎉 MATCH FOUND ON HOST: ${host}`);
    console.log('PostgreSQL version:', res[0].version);
    return true;
  } catch (err) {
    if (err.message.includes('password authentication failed')) {
      console.log(`🔑 REGION MATCHED [${host}] BUT PASSWORD WRONG:`, err.message);
      return true;
    }
    if (!err.message.includes('tenant/user')) {
      console.log(`❓ OTHER RESPONSE [${host}]:`, err.message);
    }
    return false;
  } finally {
    await sql.end().catch(() => {});
  }
}

async function run() {
  console.log('Testing IPv4 pooler hosts...');
  for (const h of poolers) {
    const ok = await check(h);
    if (ok) process.exit(0);
  }
  console.log('Done checking poolers.');
}

run();
