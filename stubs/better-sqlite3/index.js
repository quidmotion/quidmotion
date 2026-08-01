/**
 * Stub module — real DB client is node:sqlite DatabaseSync passed to drizzle({ client }).
 * Drizzle's better-sqlite3 driver imports this package at load time even when a client is supplied.
 */
class Database {
  constructor() {
    throw new Error(
      "better-sqlite3 stub: pass node:sqlite DatabaseSync as drizzle client",
    );
  }
}

module.exports = Database;
module.exports.default = Database;
