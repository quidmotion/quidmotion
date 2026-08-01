import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth, isAdmin } from "@/lib/auth";
import { siteConfig } from "@/lib/config/site";
import { logoutAction } from "@/lib/actions/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuth().getSession();
  if (!session) redirect("/login?next=/admin");
  if (!isAdmin(session.user.role)) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="font-semibold">
              {siteConfig.name} Admin
            </Link>
            <nav className="flex flex-wrap gap-1">
              {siteConfig.adminNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-1 text-xs text-white/55 hover:bg-white/8 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-white/50 hover:text-white">
              Dashboard
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="text-white/50 hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
