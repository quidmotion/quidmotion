"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Landmark,
  ArrowDownToLine,
  Banknote,
  Building2,
  Receipt,
  Gift,
  Settings,
  LogOut,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { siteConfig } from "@/lib/config/site";
import { logoutAction } from "@/lib/actions/auth";

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  invest: Landmark,
  deposit: ArrowDownToLine,
  withdraw: Banknote,
  property: Building2,
  tx: Receipt,
  referral: Gift,
  settings: Settings,
};

export function DashboardMobileNav({
  user,
}: {
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <>
      {/* Sticky top bar */}
      <header
        className="sticky top-0 z-40 -mx-1 mb-3 rounded-2xl border border-white/10 bg-black/55 px-3 py-2.5 backdrop-blur-xl md:hidden"
        style={{ top: "max(0px, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-sm font-bold">
              Q
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {siteConfig.name}
              </div>
              <div className="truncate text-[11px] text-white/40">
                {user.email}
              </div>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            {user.role === "admin" && (
              <Link
                href="/admin"
                className="flex h-9 items-center gap-1 rounded-full bg-violet-500/15 px-2.5 text-xs text-violet-200"
                aria-label="Admin"
              >
                <Shield className="h-3.5 w-3.5" />
                <span className="sr-only">Admin</span>
              </Link>
            )}
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/50 to-pink-500/50 text-[11px] font-semibold"
              title={user.name}
            >
              {initials}
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/55 hover:bg-white/10 hover:text-white"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Fixed bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/80 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        aria-label="Dashboard navigation"
      >
        <div className="mx-auto flex max-w-[1400px] gap-0.5 overflow-x-auto px-1.5 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {siteConfig.dashboardNav.map((item) => {
            const Icon = icons[item.icon] ?? Home;
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-[4.25rem] flex-1 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1.5 text-[10px] leading-tight transition",
                  active
                    ? "bg-white/12 text-white"
                    : "text-white/45 hover:bg-white/6 hover:text-white/80",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
