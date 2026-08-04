import { redirect } from "next/navigation";
import { getAuth, isAdmin } from "@/lib/auth";
import { AdminHeader } from "@/components/admin/AdminHeader";

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
      <AdminHeader />
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
