const dns = require('dns').promises;

const regions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'eu-central-2',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'sa-east-1', 'ca-central-1', 'me-central-1'
];

async function check() {
  console.log('Resolving IPv4 for pooler regions...');
  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    try {
      const res = await dns.resolve4(host);
      console.log(`[${r}] -> ${host} (${res.join(', ')})`);
    } catch (e) {}
  }
}

check();
