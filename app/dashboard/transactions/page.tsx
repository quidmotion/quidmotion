import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { listTransactions } from "@/lib/services/transactions";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";

export default async function TransactionsPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");
  const { items } = listTransactions(session.user.id, session.user.id, {
    pageSize: 50,
  });

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-sm text-white/45">Deposits, investments, and payouts.</p>
      </div>
      <Island>
        <IslandHeader>
          <span className="font-medium">History</span>
        </IslandHeader>
        <IslandBody>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-white/40">
                <tr>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx: any) => (
                  <tr key={tx.id} className="border-t border-white/5">
                    <td className="py-2.5 pr-4 text-white/50">
                      {tx.createdAt.slice(0, 10)}
                    </td>
                    <td className="py-2.5 pr-4 capitalize">{tx.type}</td>
                    <td className="py-2.5 pr-4">{tx.asset}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {formatUsd(tx.amountCents)}
                    </td>
                    <td className="py-2.5">
                      <Badge
                        tone={
                          tx.status === "confirmed"
                            ? "success"
                            : tx.status === "failed"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {tx.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="py-6 text-center text-sm text-white/40">
                No transactions yet.
              </p>
            )}
          </div>
        </IslandBody>
      </Island>
    </div>
  );
}
