export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { getBalances } from "@/lib/services/ledger";
import { listUserTransfers } from "@/lib/services/transfers";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { TransferForm } from "@/components/dashboard/TransferForm";

export default async function TransferPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");
  const kycApproved = session.user.kycStatus === "approved";

  const [balance, history] = await Promise.all([
    getBalances(session.user.id),
    listUserTransfers(session.user.id, session.user.id),
  ]);

  const recent = history.slice(0, 20);
  const otherIds = [
    ...new Set(
      recent.map((t: any) =>
        t.fromUserId === session.user.id ? t.toUserId : t.fromUserId,
      ),
    ),
  ].filter(Boolean) as string[];

  const otherById = new Map<string, { email: string; name: string }>();
  if (otherIds.length > 0) {
    const db = getDb();
    const otherRows = (await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(inArray(users.id, otherIds))) as any[];
    for (const row of otherRows) {
      otherById.set(row.id, { email: row.email, name: row.name });
    }
  }

  const enriched = recent.map((t: any) => {
    const isOut = t.fromUserId === session.user.id;
    const otherId = isOut ? t.toUserId : t.fromUserId;
    const other = otherById.get(otherId);
    return {
      ...t,
      direction: isOut ? ("out" as const) : ("in" as const),
      otherEmail: other?.email ?? "—",
      otherName: other?.name ?? "User",
    };
  });

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-4 sm:space-y-4 sm:pb-8">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Transfer</h1>
        <p className="text-xs text-white/45 sm:text-sm">
          Send available (uninvested) balance to another KYC-approved user.
          Transfers complete instantly.
        </p>
      </div>

      <Island>
        <IslandBody className="pt-5">
          <div className="text-xs uppercase text-white/40">Available</div>
          <div className="text-3xl font-semibold tabular-nums">
            {formatUsd(balance.availableCents)}
          </div>
          {!kycApproved && (
            <p className="mt-2 text-sm text-amber-300">
              KYC not approved.{" "}
              <Link href="/dashboard/settings" className="underline">
                Complete verification
              </Link>
            </p>
          )}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Send funds</span>
        </IslandHeader>
        <IslandBody>
          <TransferForm
            kycApproved={kycApproved}
            availableUsd={balance.availableCents / 100}
          />
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Recent transfers</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {enriched.length === 0 && (
            <p className="text-sm text-white/40">No transfers yet.</p>
          )}
          {enriched.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-white/8 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium tabular-nums">
                  {t.direction === "out" ? "−" : "+"}
                  {formatUsd(t.amountCents)}
                </span>
                <Badge tone={t.direction === "out" ? "warning" : "success"}>
                  {t.direction === "out" ? "sent" : "received"}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-white/45">
                {t.direction === "out" ? "To" : "From"} {t.otherName} ·{" "}
                <span className="break-all">{t.otherEmail}</span>
              </div>
              {t.note && (
                <p className="mt-1 text-xs text-white/35">{t.note}</p>
              )}
              <div className="mt-1 text-xs text-white/35">
                {String(t.createdAt).slice(0, 16).replace("T", " ")}
              </div>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
