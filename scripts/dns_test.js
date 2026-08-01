const dns = require('dns').promises;

async function run() {
  console.log('Resolving IPv4 for db.obcssaddhwwybtdwvggz.supabase.co...');
  try {
    const v4 = await dns.resolve4('db.obcssaddhwwybtdwvggz.supabase.co');
    console.log('IPv4:', v4);
  } catch (e) {
    console.log('IPv4 failed:', e.message);
  }

  console.log('Resolving IPv6 for db.obcssaddhwwybtdwvggz.supabase.co...');
  try {
    const v6 = await dns.resolve6('db.obcssaddhwwybtdwvggz.supabase.co');
    console.log('IPv6:', v6);
  } catch (e) {
    console.log('IPv6 failed:', e.message);
  }

  console.log('Resolving CNAME / ANY...');
  try {
    const cname = await dns.resolveCname('db.obcssaddhwwybtdwvggz.supabase.co');
    console.log('CNAME:', cname);
  } catch (e) {
    console.log('CNAME failed:', e.message);
  }
}

run();
