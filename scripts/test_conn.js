const postgres = require('postgres');

const sql = postgres({
  host: 'db.obcssaddhwwybtdwvggz.supabase.co',
  port: 5432,
  user: 'postgres',
  password: '@#@101010Work%',
  database: 'postgres',
  ssl: 'require'
});

async function run() {
  try {
    const res = await sql`SELECT version();`;
    console.log('CONNECTED SUCCESSFULLY!');
    console.log('PostgreSQL Version:', res[0].version);
  } catch (err) {
    console.error('CONNECTION ERROR:', err);
  } finally {
    await sql.end();
  }
}

run();
