import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { schema } from "./schema";

/** Local/Postgres database typed via Drizzle schema */
export type AppDatabase = BetterSQLite3Database<typeof schema> | any;

export interface DbAdapter {
  readonly provider: "local" | "supabase";
  readonly db: AppDatabase;
  migrate?(): Promise<void>;
  close?(): Promise<void>;
}
