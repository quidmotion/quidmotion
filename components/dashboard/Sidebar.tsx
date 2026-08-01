"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Briefcase,
  Wallet,
  Building2,
  ArrowLeftRight,
  Gift,
  Settings,
  Shield,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { siteConfig } from "@/lib/config/site";
import { logoutAction } from "@/lib/actions/auth";

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  invest: Briefcase,
  deposit: Wallet,
  withdraw: Banknote,
  property: Building2,
  tx: ArrowLeftRight,
  referral: Gift,
  settings: Settings,
};

export function DashboardSidebar({
  user,
  showReferrals = true,
}: {
  user: { name: string; email: string; role: string; avatarUrl?: string | null };
  showReferrals?: boolean;
}) {
  const pathname = usePathname();
  const nav = siteConfig.dashboardNav.filter(
    (item) => item.href !== "/dashboard/referrals" || showReferrals,
  );

  return (
    <aside className="flex h-full w-[240px] flex-col rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur-xl">
      <Link href="/" className="mb-4 flex items-center gap-2 px-2 py-2 font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-sm font-bold">
          Q
        </span>
        <span>QuidMotion</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((item) => {
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
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-white/12 text-white"
                  : "text-white/55 hover:bg-white/6 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {user.role === "admin" ? (
          <Link
            href="/admin"
            className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-violet-300 hover:bg-white/6"
          >
            <Shield className="h-4 w-4" />
            Admin
          </Link>
        ) : null}
      </nav>

      <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/50 to-pink-500/50 text-xs font-semibold">
            {user.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-white/40">
              {user.role === "admin" ? "Admin" : "Personal account"}
            </div>
          </div>
        </div>
        <form action={logoutAction} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-white/45 hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
