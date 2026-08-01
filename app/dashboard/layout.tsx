import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { siteConfig } from "@/lib/config/site";
import { logoutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils/cn";
import {
  Home,
  Landmark,
  ArrowDownToLine,
  Building2,
  Receipt,
  Gift,
  Settings,
  LogOut,
  Shield,
} from "lucide-react";

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  invest: Landmark,
  deposit: ArrowDownToLine,
  property: Building2,
  tx: Receipt,
  referral: Gift,
  settings: Settings,
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuth().getSession();
  if (!session) redirect("/login?next=/dashboard");
  if (session.user.status === "suspended") redirect("/login?error=suspended");

  const { user } = session;

  return (
    <div className="qm-canvas-photo min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1400px] gap-4 p-3 md:p-4">
        {/* Sidebar island */}
        <aside className="hidden w-56 shrink-0 flex-col rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur-xl md:flex lg:w-64">
          <Link href="/" className="mb-6 flex items-center gap-2 px-2 pt-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-sm font-bold">
              Q
            </span>
            <span className="font-semibold">{siteConfig.name}</span>
          </Link>

          <nav className="flex flex-1 flex-col gap-1">
            {siteConfig.dashboardNav.map((item: any) => {
              const Icon = icons[item.icon] ?? Home;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/65 transition hover:bg-white/8 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            {user.role === "admin" && (
              <Link
                href="/admin"
                className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-violet-300 transition hover:bg-violet-500/10"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            )}
          </nav>

          <div className="mt-auto rounded-xl border border-white/8 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/50 to-pink-500/50 text-xs font-semibold">
                {user.name
                  .split(" ")
                  .map((n: any) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-xs text-white/40">{user.email}</div>
              </div>
            </div>
            <form action={logoutAction} className="mt-2">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/50 hover:bg-white/8 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top nav */}
          <div className="mb-3 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur md:hidden">
            {siteConfig.dashboardNav.map((item: any) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/70"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
