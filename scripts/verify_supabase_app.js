// Import server DB layer
process.env.DB_PROVIDER = 'supabase';
process.env.DATABASE_URL = 'postgresql://postgres.obcssaddhwwybtdwvggz:%40%23%40101010Work%25@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const { getDb } = require('../lib/db');

async function testAppDb() {
  console.log('Testing App getDb() with Supabase provider...');
  try {
    const adapter = getDb();
    console.log('Provider initialized:', adapter.provider);
    
    // Perform test query
    const res = await adapter.db.execute('SELECT COUNT(*) as count FROM users');
    console.log('Query result from Supabase users table:', res);
    console.log('\n🎉 SUCCESS: Application DB layer is connected and working with Supabase!');
  } catch (err) {
    console.error('❌ Error testing getDb():', err);
  }
}

testAppDb();
