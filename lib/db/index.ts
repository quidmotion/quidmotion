import "server-only";
import type { DbAdapter, AppDatabase } from "./types";
// server-only: pages/services import getDb from here, never from adapters directly.
import * as localAdapter from "./adapters/local";
import * as supabaseAdapter from "./adapters/supabase";

let _adapter: DbAdapter | null = null;

export function setDbAdapterForTests(adapter: DbAdapter | null): void {
  _adapter = adapter;
}

export function resetDbForTests(): void {
  _adapter = null;
}

export function getDbAdapter(): DbAdapter {
  if (_adapter) return _adapter;
  const provider = (process.env.DB_PROVIDER ?? "local") as "local" | "supabase";
  if (provider === "supabase") {
    _adapter = supabaseAdapter.createSupabaseAdapter();
  } else {
    _adapter = localAdapter.createLocalAdapter();
  }
  return _adapter;
}

export function getDb(): AppDatabase {
  return getDbAdapter().db;
}
