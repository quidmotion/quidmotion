import "server-only";
import { AppError } from "@/lib/errors";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "../schema";
import type { DbAdapter } from "../types";

/**
 * Supabase/Postgres adapter.
 * Uses the `DATABASE_URL` env var (supabase connection string).
 * Provides async client and a `close` method for graceful shutdown.
 */
export function createSupabaseAdapter(): DbAdapter {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new AppError(
      "INTERNAL",
      "DATABASE_URL not set – cannot create Supabase adapter.",
      500,
    );
  }
  // Create a postgres client; `prepare: false` avoids server‑side prepare statements which can cause issues in serverless.
  const client = postgres(url, { max: 5, prepare: false });
  const db = drizzle(client, { schema });
  return {
    provider: "supabase",
    db: db as unknown as any,
    close: async () => {
      await client.end();
    },
  };
}
