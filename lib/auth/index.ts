import "server-only";
import type { AuthAdapter } from "./types";
import * as localAuth from "./adapters/local";
import * as supabaseAuth from "./adapters/supabase";

let _auth: AuthAdapter | null = null;

export function setAuthForTests(adapter: AuthAdapter | null): void {
  _auth = adapter;
}

export function getAuth(): AuthAdapter {
  if (_auth) return _auth;
  const provider =
    process.env.AUTH_PROVIDER ?? process.env.DB_PROVIDER ?? "local";
  _auth =
    provider === "supabase"
      ? supabaseAuth.createSupabaseAuth()
      : localAuth.createLocalAuth();
  return _auth;
}

export type { AuthAdapter, AuthUser, Session, Role } from "./types";
export { isAdmin } from "./types";
export { SEAL_COOKIE, SESSION_COOKIE, verifySealedToken, parseCookie } from "./sealed";
