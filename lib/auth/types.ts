export type Role = "user" | "admin" | "support";

/** v1 policy: support ≡ user for authorization. */
export function isAdmin(role: Role): boolean {
  return role === "admin";
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  kycStatus: "none" | "pending" | "approved" | "rejected";
  status: "active" | "suspended";
  avatarUrl?: string | null;
  referralCode: string;
  createdAt: string;
  lockupDays: number; // new field
}

export interface Session {
  user: AuthUser;
  expiresAt: string;
  sessionId: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface RegisterInput extends Credentials {
  name: string;
  referralCode?: string;
}

export interface SealedClaims {
  sub: string;
  role: Role;
  sid: string;
  exp: number;
}

export interface AuthAdapter {
  register(input: RegisterInput): Promise<Session>;
  login(input: Credentials): Promise<Session>;
  logout(): Promise<void>;
  getSession(): Promise<Session | null>;
  verifySealedCookie(
    cookieHeader: string | null,
  ): Promise<SealedClaims | null>;
  getSessionFromCookies(cookieHeader: string | null): Promise<Session | null>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}
