import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { schema } from "./schema";

/** Local uses node:sqlite duck-typed as better-sqlite3 for drizzle. */
export type AppDatabase = any;

export interface DbAdapter {
  readonly provider: "local" | "supabase";
  readonly db: AppDatabase;
  migrate?(): Promise<void>;
  close?(): Promise<void>;
}
