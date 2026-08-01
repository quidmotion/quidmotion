const { DatabaseSync } = require('node:sqlite');

const dbPath = './data/quidmotion.db';

try {
  const db = new DatabaseSync(dbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Local SQLite tables:');
  for (const t of tables) {
    if (t.name.startsWith('sqlite_')) continue;
    const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
    console.log(`  - ${t.name}: ${count.c} rows`);
  }
} catch (e) {
  console.error('Error reading sqlite:', e.message);
}
