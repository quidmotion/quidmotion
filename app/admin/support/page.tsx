export const dynamic = "force-dynamic";

import { requireAdminPath } from "@/lib/admin/guard";
import { SupportInbox } from "@/components/admin/SupportInbox";

export default async function AdminSupportPage() {
  await requireAdminPath("/admin/support");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Support chat</h1>
        <p className="text-xs text-white/45 sm:text-sm">
          Shared inbox — reply to live user and guest conversations.
        </p>
      </div>
      <SupportInbox />
    </div>
  );
}
