const postgres = require('postgres');

const projectRef = 'obcssaddhwwybtdwvggz';
const user = `postgres.${projectRef}`;
const password = '@#@101010Work%';
const database = 'postgres';

const regions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'eu-central-2',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'sa-east-1', 'ca-central-1', 'me-central-1'
];

async function checkRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
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
    console.log(`\n🎉 MATCH FOUND! Region: ${region} (${host})`);
    console.log('PostgreSQL version:', res[0].version);
    return true;
  } catch (err) {
    if (err.message.includes('password authentication failed')) {
      console.log(`🔑 REGION MATCHED [${region}] BUT PASSWORD INVALID:`, err.message);
      return true;
    }
    if (!err.message.includes('tenant/user') && !err.message.includes('ENOTFOUND') && !err.message.includes('EAI_AGAIN')) {
      console.log(`❓ REGION [${region}] OTHER ERROR:`, err.message);
    }
    return false;
  } finally {
    await sql.end().catch(() => {});
  }
}

async function main() {
  console.log('Scanning Supabase regions for tenant project:', projectRef);
  for (const r of regions) {
    const found = await checkRegion(r);
    if (found) break;
  }
}

main();
