/**
 * Edge-safe sealed session cookie (no Node natives, no DB).
 * Compact HS256 JWT via Web Crypto only — safe in Next.js middleware Edge runtime.
 */
import type { Role, SealedClaims } from "./types";

export const SEAL_COOKIE = "qm_seal";
export const SESSION_COOKIE = "qm_session";

function getSecretBytes(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

function b64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
  // btoa available in Edge + browsers; Node 16+ also has it on global
  const b64 =
    typeof btoa === "function"
      ? btoa(str)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function hmacKey(): Promise<CryptoKey> {
  // Fresh copy so the key material is a plain ArrayBuffer-backed Uint8Array
  const secret = new Uint8Array(getSecretBytes());
  return crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function mintSealedCookie(input: {
  sub: string;
  role: Role;
  sid: string;
  expiresAt: Date;
}): Promise<string> {
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const exp = Math.floor(input.expiresAt.getTime() / 1000);
  const payload = b64urlJson({
    sub: input.sub,
    role: input.role,
    sid: input.sid,
    exp,
    iat: Math.floor(Date.now() / 1000),
  });
  const data = `${header}.${payload}`;
  const key = await hmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return `${data}.${b64url(sig)}`;
}

export async function verifySealedToken(
  token: string,
): Promise<SealedClaims | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const data = `${header}.${payload}`;
    const key = await hmacKey();
    const sigBytes = fromB64url(sig);
    // Copy into a fresh ArrayBuffer-backed view for Web Crypto BufferSource typing
    const sigCopy = new Uint8Array(sigBytes);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigCopy,
      new TextEncoder().encode(data),
    );
    if (!ok) return null;
    const claims = JSON.parse(
      new TextDecoder().decode(fromB64url(payload)),
    ) as {
      sub?: string;
      role?: Role;
      sid?: string;
      exp?: number;
    };
    if (!claims.sub || typeof claims.sid !== "string") return null;
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return {
      sub: claims.sub,
      role: claims.role ?? "user",
      sid: claims.sid,
      exp: claims.exp ?? 0,
    };
  } catch {
    return null;
  }
}

export function parseCookie(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
