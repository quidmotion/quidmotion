const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('./data/quidmotion.db');

const usersCols = db.prepare("PRAGMA table_info('users')").all();
console.log('SQLite users columns:', usersCols.map(c => c.name));

const sampleUser = db.prepare("SELECT * FROM users LIMIT 1").get();
console.log('Sample user row:', sampleUser);
