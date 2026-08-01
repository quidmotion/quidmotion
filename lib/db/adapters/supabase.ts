import "server-only";
import { AppError } from "@/lib/errors";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "../schema";
import type { DbAdapter } from "../types";

function parsePgOptions(url: string) {
  if (process.env.PGHOST && process.env.PGPASSWORD) {
    return {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT ?? 5432),
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE ?? "postgres",
      ssl: "require" as const,
      max: 5,
      prepare: false,
    };
  }

  const schemeIndex = url.indexOf("://");
  if (schemeIndex === -1) return url;
  const rest = url.slice(schemeIndex + 3);
  const lastAt = rest.lastIndexOf("@");
  if (lastAt === -1) return url;

  const userPass = rest.slice(0, lastAt);
  const hostPortDb = rest.slice(lastAt + 1);

  const firstColon = userPass.indexOf(":");
  if (firstColon === -1) return url;

  let user = userPass.slice(0, firstColon);
  let password = userPass.slice(firstColon + 1);

  const slashIndex = hostPortDb.indexOf("/");
  if (slashIndex === -1) return url;

  const hostPort = hostPortDb.slice(0, slashIndex);
  let database = hostPortDb.slice(slashIndex + 1).split("?")[0];

  let host = hostPort;
  let port = 5432;
  const colonIndex = hostPort.lastIndexOf(":");
  if (colonIndex !== -1 && !isNaN(Number(hostPort.slice(colonIndex + 1)))) {
    host = hostPort.slice(0, colonIndex);
    port = Number(hostPort.slice(colonIndex + 1));
  }

  try {
    password = decodeURIComponent(password);
  } catch {}
  try {
    user = decodeURIComponent(user);
  } catch {}

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: "require" as const,
    max: 5,
    prepare: false,
  };
}

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
  const options = parsePgOptions(url);
  const client =
    typeof options === "string"
      ? postgres(options, { max: 5, prepare: false })
      : postgres(options);
  const db = drizzle(client, { schema });
  return {
    provider: "supabase",
    db: db as unknown as any,
    close: async () => {
      await client.end();
    },
  };
}
