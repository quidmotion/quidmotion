import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireStaffContext } from "@/lib/admin/guard";
import { filterAdminNav } from "@/lib/admin/nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireStaffContext();
  const nav = filterAdminNav(ctx.user.role, ctx.privileges);

  return (
    <div className="min-h-screen">
      <AdminHeader
        nav={nav}
        roleLabel={ctx.isFullAdmin ? "Admin" : "Support"}
      />
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
