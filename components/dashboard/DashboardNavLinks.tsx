"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Landmark,
  ArrowDownToLine,
  ArrowLeftRight,
  Banknote,
  Building2,
  Receipt,
  Gift,
  Settings,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { siteConfig } from "@/lib/config/site";

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  invest: Landmark,
  deposit: ArrowDownToLine,
  transfer: ArrowLeftRight,
  withdraw: Banknote,
  property: Building2,
  tx: Receipt,
  referral: Gift,
  settings: Settings,
};

export function DashboardNavLinks({
  isAdmin = false,
  staffLabel = "Admin",
}: {
  isAdmin?: boolean;
  staffLabel?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1">
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
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              active
                ? "bg-white/12 text-white"
                : "text-white/65 hover:bg-white/8 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          href="/admin"
          className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-violet-300 transition hover:bg-violet-500/10"
        >
          <Shield className="h-4 w-4 shrink-0" />
          {staffLabel}
        </Link>
      )}
    </nav>
  );
}
