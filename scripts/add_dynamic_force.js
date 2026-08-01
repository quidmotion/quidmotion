const fs = require('fs');
const path = require('path');

const targetFiles = [
  'D:/QuidMotion/app/(marketing)/page.tsx',
  'D:/QuidMotion/app/(marketing)/plans/page.tsx',
  'D:/QuidMotion/app/(marketing)/faq/page.tsx',
  'D:/QuidMotion/app/(marketing)/about/page.tsx',
  'D:/QuidMotion/app/(marketing)/documents/page.tsx',
  'D:/QuidMotion/app/(marketing)/documents/[slug]/page.tsx',
  'D:/QuidMotion/app/admin/page.tsx',
  'D:/QuidMotion/app/admin/audit/page.tsx',
  'D:/QuidMotion/app/admin/content/page.tsx',
  'D:/QuidMotion/app/admin/deposits/page.tsx',
  'D:/QuidMotion/app/admin/kyc/page.tsx',
  'D:/QuidMotion/app/admin/payouts/page.tsx',
  'D:/QuidMotion/app/admin/plans/page.tsx',
  'D:/QuidMotion/app/admin/properties/page.tsx',
  'D:/QuidMotion/app/admin/settings/page.tsx',
  'D:/QuidMotion/app/admin/users/page.tsx',
  'D:/QuidMotion/app/dashboard/page.tsx',
  'D:/QuidMotion/app/dashboard/deposit/page.tsx',
  'D:/QuidMotion/app/dashboard/investments/page.tsx',
  'D:/QuidMotion/app/dashboard/properties/page.tsx',
  'D:/QuidMotion/app/dashboard/referrals/page.tsx',
  'D:/QuidMotion/app/dashboard/transactions/page.tsx',
  'D:/QuidMotion/app/dashboard/withdraw/page.tsx'
];

targetFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('force-dynamic')) {
    content = `export const dynamic = "force-dynamic";\n` + content;
    fs.writeFileSync(file, content, 'utf8');
    console.log('Added force-dynamic to:', file);
  }
});
