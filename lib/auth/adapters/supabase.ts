import "server-only";
import { AppError } from "@/lib/errors";
import type { AuthAdapter } from "../types";

export function createSupabaseAuth(): AuthAdapter {
  throw new AppError(
    "INTERNAL",
    "AUTH_PROVIDER=supabase is not configured yet. Use local auth or complete MIGRATION.md.",
    500,
  );
}
