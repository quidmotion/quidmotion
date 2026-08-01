import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { KycForm } from "@/components/dashboard/KycForm";
import { getLatestForUser } from "@/lib/services/kyc";

export default async function SettingsPage() {
  const session = await getAuth().getSession();
  if (!session) redirect("/login");
  const { user } = session;
  const latest = await getLatestForUser(user.id, user.id);

  const kycTone =
    user.kycStatus === "approved"
      ? "success"
      : user.kycStatus === "pending"
        ? "warning"
        : user.kycStatus === "rejected"
          ? "danger"
          : "neutral";

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="text-sm text-white/45">Profile, KYC, and security.</p>
      </div>

      <Island>
        <IslandHeader>
          <span className="font-medium">Profile</span>
        </IslandHeader>
        <IslandBody className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/40">Name</span>
            <span>{user.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Role</span>
            <span className="capitalize">{user.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Referral code</span>
            <span className="font-mono text-violet-300">{user.referralCode}</span>
          </div>
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">KYC verification</span>
          <Badge tone={kycTone}>{user.kycStatus}</Badge>
        </IslandHeader>
        <IslandBody>
          {user.kycStatus === "approved" ? (
            <div className="space-y-2 text-sm">
              <p className="text-emerald-400">
                You are fully verified and can invest and withdraw.
              </p>
              {latest?.fullLegalName && (
                <p className="text-white/45">
                  Verified as {latest.fullLegalName}
                  {latest.reviewedAt
                    ? ` · reviewed ${latest.reviewedAt.slice(0, 10)}`
                    : ""}
                </p>
              )}
            </div>
          ) : user.kycStatus === "pending" ? (
            <div className="space-y-2 text-sm">
              <p className="text-amber-300">
                Submission under review by the compliance team. You will receive
                an email when a decision is made.
              </p>
              {latest && (
                <p className="text-xs text-white/40">
                  Submitted {latest.createdAt.slice(0, 16).replace("T", " ")}
                  {latest.fullLegalName ? ` · ${latest.fullLegalName}` : ""}
                </p>
              )}
            </div>
          ) : (
            <>
              {user.kycStatus === "rejected" && latest?.reviewerNote && (
                <p className="mb-3 text-sm text-red-300">
                  Previous decision: {latest.reviewerNote}. You may resubmit
                  below.
                </p>
              )}
              <KycForm />
            </>
          )}
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Security</span>
        </IslandHeader>
        <IslandBody className="text-sm text-white/50">
          Passwords are hashed with scrypt. Sessions use sealed Edge cookies
          plus revocable server sessions. Withdrawal addresses are supplied
          per-request and never stored as a default wallet without your action.
        </IslandBody>
      </Island>
    </div>
  );
}
