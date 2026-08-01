import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SEAL_COOKIE, verifySealedToken } from "@/lib/auth/sealed";

/**
 * Edge-safe gate only: verify sealed JWT cookie. No SQLite / Argon2.
 * Full session + suspended checks happen in dashboard/admin layouts.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");
  const isAdmin = pathname.startsWith("/admin");

  if (!isDashboard && !isAdmin) {
    return NextResponse.next();
  }

  const seal = request.cookies.get(SEAL_COOKIE)?.value;
  if (!seal) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const claims = await verifySealedToken(seal);
  if (!claims) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    const res = NextResponse.redirect(login);
    res.cookies.delete(SEAL_COOKIE);
    return res;
  }

  if (isAdmin && claims.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
