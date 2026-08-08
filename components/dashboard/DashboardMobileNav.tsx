"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { siteConfig } from "@/lib/config/site";
import { logoutAction } from "@/lib/actions/auth";

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

export function DashboardMobileNav({
  user,
}: {
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const updateScrollHints = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScrollHints();
    el.addEventListener("scroll", updateScrollHints, { passive: true });
    window.addEventListener("resize", updateScrollHints);
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateScrollHints)
        : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollHints);
      window.removeEventListener("resize", updateScrollHints);
      ro?.disconnect();
    };
  }, [updateScrollHints]);

  function scrollNav(direction: "left" | "right") {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.55, 120);
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  return (
    <>
      {/* Sticky top bar */}
      <header
        className="sticky top-0 z-40 mb-3 w-full max-w-full rounded-2xl border border-white/10 bg-black/55 px-3 py-2.5 backdrop-blur-xl md:hidden"
        style={{ top: "max(0px, env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
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
        <div className="relative mx-auto max-w-[1400px]">
          {/* Left scroll hint */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollNav("left")}
              className="absolute left-0 top-1/2 z-10 flex h-9 w-8 -translate-y-1/2 items-center justify-center rounded-r-lg bg-gradient-to-r from-black via-black/95 to-transparent text-white/80"
              aria-label="Show previous navigation items"
            >
              <ChevronLeft className="h-5 w-5 animate-pulse" />
            </button>
          )}

          {/* Right scroll hint */}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollNav("right")}
              className="absolute right-0 top-1/2 z-10 flex h-9 w-8 -translate-y-1/2 items-center justify-center rounded-l-lg bg-gradient-to-l from-black via-black/95 to-transparent text-white/80"
              aria-label="Show more navigation items"
            >
              <ChevronRight className="h-5 w-5 animate-pulse" />
            </button>
          )}

          <div
            ref={scrollerRef}
            className="flex gap-0.5 overflow-x-auto overscroll-x-contain scroll-smooth px-1.5 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
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
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
