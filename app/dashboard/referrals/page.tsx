import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { features } from "@/lib/config/features";
import { getRewards } from "@/lib/services/referrals";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { YieldDonut } from "@/components/dashboard/YieldDonut";

export default async function ReferralsPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");

  if (!features.referrals) {
    return (
      <div className="pb-8">
        <h1 className="text-2xl font-semibold">Referrals</h1>
        <p className="mt-2 text-sm text-white/45">Referrals are currently disabled.</p>
      </div>
    );
  }

  const rewards = getRewards(session.user.id, session.user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Referrals & rewards</h1>
        <p className="text-sm text-white/45">
          Share your code and earn when friends invest.
        </p>
      </div>
      <Island>
        <IslandBody className="pt-5 text-center">
          <div className="text-xs uppercase text-white/40">Your code</div>
          <div className="mt-2 text-3xl font-semibold tracking-widest text-violet-300">
            {rewards.referralCode}
          </div>
        </IslandBody>
      </Island>
      <Island>
        <IslandHeader>
          <span className="font-medium">Reward totals</span>
        </IslandHeader>
        <IslandBody>
          {rewards.totalCents > 0 ? (
            <YieldDonut
              totalCents={rewards.totalCents}
              segments={
                rewards.breakdown.length > 0
                  ? rewards.breakdown
                  : [
                      {
                        key: "Referral rewards",
                        amountCents: rewards.totalCents,
                        color: "#22c55e",
                      },
                    ]
              }
            />
          ) : (
            <p className="text-sm text-white/40">
              No referral rewards earned yet. Share your code to start earning.
            </p>
          )}
        </IslandBody>
      </Island>
      <Island>
        <IslandHeader>
          <span className="font-medium">History</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {rewards.rewards.length === 0 && (
            <p className="text-sm text-white/40">No rewards yet.</p>
          )}
          {rewards.rewards.map((r) => (
            <div
              key={r.id}
              className="flex justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"
            >
              <span className="text-white/50">{r.createdAt.slice(0, 10)}</span>
              <span className="tabular-nums">{formatUsd(r.amountCents)}</span>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
