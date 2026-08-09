export const dynamic = "force-dynamic";

import { requireFullAdmin } from "@/lib/admin/guard";
import { listSupportStaff } from "@/lib/services/support-staff";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  PRIVILEGE_KEYS,
  PRIVILEGE_LABELS,
  type PrivilegeKey,
} from "@/lib/auth/privileges";
import {
  createSupportStaffAction,
  setSupportPasswordAction,
  setUserStatusAction,
  updateSupportPrivilegesAction,
} from "@/lib/actions/admin";
import { SupportStaffForms } from "@/components/admin/SupportStaffForms";

export default async function SupportStaffPage() {
  const ctx = await requireFullAdmin();
  const staff = await listSupportStaff(ctx.user.id);

  const groups = new Map<string, PrivilegeKey[]>();
  for (const key of PRIVILEGE_KEYS) {
    const g = PRIVILEGE_LABELS[key].group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(key);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Support staff</h1>
        <p className="text-xs text-white/45 sm:text-sm">
          Create support personnel and toggle their privileges. New staff start
          with chat access only.
        </p>
      </div>

      <Island>
        <IslandHeader>
          <span className="font-medium">Create support personnel</span>
        </IslandHeader>
        <IslandBody>
          <SupportStaffForms mode="create" />
        </IslandBody>
      </Island>

      <div className="space-y-4">
        <h2 className="text-sm font-medium text-white/70">
          {staff.length} support account{staff.length === 1 ? "" : "s"}
        </h2>
        {staff.length === 0 && (
          <p className="text-sm text-white/40">No support staff yet.</p>
        )}
        {staff.map((s: any) => (
          <Island key={s.id}>
            <IslandHeader>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.name}</div>
                <div className="truncate text-xs text-white/45">{s.email}</div>
              </div>
              <Badge tone={s.status === "active" ? "success" : "danger"}>
                {s.status}
              </Badge>
            </IslandHeader>
            <IslandBody className="space-y-5">
              <form action={updateSupportPrivilegesAction} className="space-y-4">
                <input type="hidden" name="userId" value={s.id} />
                {[...groups.entries()].map(([group, keys]) => (
                  <div key={group}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-300">
                      {group}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {keys.map((key) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 hover:bg-white/8"
                        >
                          <input
                            type="checkbox"
                            name={`priv_${key}`}
                            defaultChecked={!!s.privileges?.[key]}
                            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 text-violet-500"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-white">
                              {PRIVILEGE_LABELS[key].label}
                            </span>
                            <span className="block text-[11px] text-white/40">
                              {PRIVILEGE_LABELS[key].description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <Button type="submit" size="sm">
                  Save privileges
                </Button>
              </form>

              <div className="grid gap-4 border-t border-white/8 pt-4 sm:grid-cols-2">
                <form action={setSupportPasswordAction} className="space-y-2">
                  <input type="hidden" name="userId" value={s.id} />
                  <Label htmlFor={`pw_${s.id}`}>Reset password</Label>
                  <Input
                    id={`pw_${s.id}`}
                    name="password"
                    type="password"
                    minLength={8}
                    required
                    placeholder="New password (8+)"
                    autoComplete="new-password"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Update password
                  </Button>
                </form>

                <form action={setUserStatusAction} className="flex flex-col justify-end">
                  <input type="hidden" name="userId" value={s.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={s.status === "active" ? "suspended" : "active"}
                  />
                  <Button
                    type="submit"
                    variant={s.status === "active" ? "danger" : "secondary"}
                    size="sm"
                  >
                    {s.status === "active" ? "Suspend account" : "Reactivate"}
                  </Button>
                </form>
              </div>
            </IslandBody>
          </Island>
        ))}
      </div>
    </div>
  );
}
