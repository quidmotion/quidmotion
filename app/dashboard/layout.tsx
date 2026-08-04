import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { siteConfig } from "@/lib/config/site";
import { logoutAction } from "@/lib/actions/auth";
import { LogOut } from "lucide-react";
import { DashboardMobileNav } from "@/components/dashboard/DashboardMobileNav";
import { DashboardNavLinks } from "@/components/dashboard/DashboardNavLinks";

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
      <div className="mx-auto flex min-h-screen max-w-[1400px] gap-3 p-2 sm:gap-4 sm:p-3 md:p-4">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 flex-col rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur-xl md:flex lg:w-64">
          <Link href="/" className="mb-6 flex items-center gap-2 px-2 pt-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-sm font-bold">
              Q
            </span>
            <span className="font-semibold">{siteConfig.name}</span>
          </Link>

          <DashboardNavLinks isAdmin={user.role === "admin"} />

          <div className="mt-auto rounded-xl border border-white/8 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/50 to-pink-500/50 text-xs font-semibold">
                {user.name
                  .split(" ")
                  .map((n: string) => n[0])
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
          <DashboardMobileNav
            user={{ name: user.name, email: user.email, role: user.role }}
          />
          {/* Bottom nav clearance on mobile only */}
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
