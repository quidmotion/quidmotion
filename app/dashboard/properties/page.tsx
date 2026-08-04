export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { listFeatured } from "@/lib/services/properties";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { InvestmentDisclaimer } from "@/components/shared/InvestmentDisclaimer";

export default async function PropertiesPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");
  const properties = await listFeatured(20);

  return (
    <div className="space-y-3 pb-4 sm:space-y-4 sm:pb-8">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">
          Properties & live deals
        </h1>
        <p className="text-xs text-white/45 sm:text-sm">
          Featured real estate opportunities managed by the QuidMotion team.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((p: any) => {
          const pct =
            p.targetRaiseCents > 0
              ? Math.min(100, (p.raisedCents / p.targetRaiseCents) * 100)
              : 0;
          return (
            <Island key={p.id}>
              <IslandBody className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium">{p.name}</h2>
                  <Badge tone="accent">{p.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-white/40">{p.location}</p>
                <p className="mt-3 text-sm text-white/55 line-clamp-3">
                  {p.description}
                </p>
                <div className="mt-4 text-sm text-emerald-400">
                  {(p.expectedApyBps / 100).toFixed(1)}% expected APY
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-white/40">
                  {formatUsd(p.raisedCents)} of {formatUsd(p.targetRaiseCents)}{" "}
                  raised
                </div>
              </IslandBody>
            </Island>
          );
        })}
      </div>
      <InvestmentDisclaimer />
    </div>
  );
}
