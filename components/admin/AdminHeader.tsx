"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, LayoutDashboard, LogOut } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { siteConfig } from "@/lib/config/site";
import { logoutAction } from "@/lib/actions/auth";

export function AdminHeader({
  nav,
  roleLabel = "Admin",
}: {
  nav: { label: string; href: string }[];
  roleLabel?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/55 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/admin" className="min-w-0 truncate font-semibold">
            <span className="sm:hidden">{siteConfig.name}</span>
            <span className="hidden sm:inline">
              {siteConfig.name} {roleLabel}
            </span>
          </Link>
        </div>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs transition",
                isActive(item.href)
                  ? "bg-white/12 text-white"
                  : "text-white/55 hover:bg-white/8 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-white/55 hover:bg-white/8 hover:text-white sm:text-sm"
          >
            <LayoutDashboard className="h-3.5 w-3.5 sm:hidden" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-white/55 hover:bg-white/8 hover:text-white sm:text-sm"
            >
              <LogOut className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </div>

      {open && (
        <div className="lg:hidden">
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60"
            aria-label="Close menu overlay"
            onClick={() => setOpen(false)}
          />
          <nav
            id="admin-mobile-nav"
            className="absolute inset-x-0 top-full z-50 max-h-[min(70vh,28rem)] overflow-y-auto border-b border-white/10 bg-[#0c0d12]/95 px-3 py-3 shadow-2xl backdrop-blur-xl"
          >
            <div className="mx-auto grid max-w-6xl gap-1 sm:grid-cols-2">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-xl px-3 py-3 text-sm transition",
                    isActive(item.href)
                      ? "bg-violet-500/20 text-violet-100"
                      : "text-white/70 hover:bg-white/8 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mx-auto mt-3 flex max-w-6xl gap-2 border-t border-white/10 pt-3 sm:hidden">
              <Link
                href="/dashboard"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm text-white/70"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <form action={logoutAction} className="flex-1">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm text-white/70"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
