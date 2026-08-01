const dns = require('dns').promises;

const projectRef = 'obcssaddhwwybtdwvggz';
const regions = [
  'us-east-1', 'us-west-1', 'us-east-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1',
  'sa-east-1', 'ca-central-1'
];

async function check() {
  console.log('Testing pooler hosts...');
  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    try {
      const addrs = await dns.lookup(host);
      console.log(`FOUND POOLER REGION [${r}]: ${host} -> ${addrs.address}`);
    } catch (e) {}
  }

  console.log('Testing direct hosts...');
  const directHosts = [
    `db.${projectRef}.supabase.co`,
    `db.${projectRef}.supabase.com`,
    `${projectRef}.supabase.co`,
  ];
  for (const h of directHosts) {
    try {
      const addrs = await dns.lookup(h);
      console.log(`FOUND DIRECT HOST: ${h} -> ${addrs.address}`);
    } catch (e) {}
  }
}

check();
