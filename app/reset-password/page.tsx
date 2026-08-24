export const dynamic = "force-dynamic";

import { ResetPasswordClient } from "@/components/shared/ResetPasswordClient";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <div className="px-4 py-16">
        <ResetPasswordClient token={sp.token ?? ""} />
      </div>
    </div>
  );
}
