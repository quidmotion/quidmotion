import "server-only";
import { headers } from "next/headers";

function stripSlash(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Canonical public origin for links in emails.
 * Prefer the incoming request host so reset links match the deployment
 * the user is on, instead of a stale NEXT_PUBLIC_SITE_URL / preview URL.
 */
export async function getPublicSiteUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
      .split(",")[0]
      ?.trim();
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https");
      return stripSlash(`${proto}://${host}`);
    }
  } catch {
    // Not in a request (scripts / tests).
  }
  if (env) return stripSlash(env);
  return "http://localhost:3000";
}
