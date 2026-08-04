export const dynamic = "force-dynamic";
import { getAuth } from "@/lib/auth";
import { listUsers, setUserStatus } from "@/lib/services/users";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { revalidatePath } from "next/cache";

async function toggleStatus(formData: FormData) {
  "use server";
  const session = await getAuth().getSession();
  if (!session) return;
  const userId = String(formData.get("userId"));
  const status = String(formData.get("status")) as "active" | "suspended";
  await setUserStatus(session.user.id, userId, status);
  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  const session = await getAuth().getSession();
  const { items: users, total } = await listUsers(session!.user.id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold sm:text-2xl">Users</h1>
      <Island>
        <IslandHeader>
          <span className="font-medium">{total} accounts</span>
        </IslandHeader>
        <IslandBody>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {users.map((u: any) => (
              <div
                key={u.id}
                className="rounded-xl border border-white/8 bg-white/5 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{u.name}</div>
                    <div className="truncate text-xs text-white/45">{u.email}</div>
                  </div>
                  <Badge tone={u.status === "active" ? "success" : "danger"}>
                    {u.status}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/45">
                  <span className="capitalize">{u.role}</span>
                  <span>·</span>
                  <Badge tone="neutral">{u.kycStatus}</Badge>
                </div>
                {u.role !== "admin" && (
                  <form action={toggleStatus} className="mt-3">
                    <input type="hidden" name="userId" value={u.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={u.status === "active" ? "suspended" : "active"}
                    />
                    <button
                      type="submit"
                      className="rounded-full bg-violet-500/15 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/25"
                    >
                      {u.status === "active" ? "Suspend" : "Activate"}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase text-white/40">
                <tr>
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Email</th>
                  <th className="pb-2 pr-3">Role</th>
                  <th className="pb-2 pr-3">KYC</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="py-2 pr-3">{u.name}</td>
                    <td className="py-2 pr-3 text-white/50">{u.email}</td>
                    <td className="py-2 pr-3 capitalize">{u.role}</td>
                    <td className="py-2 pr-3">
                      <Badge tone="neutral">{u.kycStatus}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        tone={u.status === "active" ? "success" : "danger"}
                      >
                        {u.status}
                      </Badge>
                    </td>
                    <td className="py-2">
                      {u.role !== "admin" && (
                        <form action={toggleStatus}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={
                              u.status === "active" ? "suspended" : "active"
                            }
                          />
                          <button
                            type="submit"
                            className="text-xs text-violet-300 hover:underline"
                          >
                            {u.status === "active" ? "Suspend" : "Activate"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </IslandBody>
      </Island>
    </div>
  );
}
