export const dynamic = "force-dynamic";
import { getAuth } from "@/lib/auth";
import {
  getDepositWallets,
  getOfficialEmails,
} from "@/lib/services/settings";
import { listDefaultPortfolioRates, getLockupMultipliers } from "@/lib/services/growth";
import { listRecentPrices } from "@/lib/services/crypto";
import { listEmailOutbox } from "@/lib/services/email";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  updateDepositWalletsAction,
  updateOfficialEmailsAction,
  refreshPricesAction,
  runGrowthAccrualAction,
  updateApyRulesAction,
} from "@/lib/actions/admin";

export default async function AdminSettingsPage() {
  const session = await getAuth().getSession();
  const wallets = await getDepositWallets();
  const emails = await getOfficialEmails();
  const rates = await listDefaultPortfolioRates();
  const mults = await getLockupMultipliers();
  const prices = await listRecentPrices();
  const outbox = await listEmailOutbox(session!.user.id, 15);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform settings</h1>
        <p className="text-sm text-white/45">
          Deposit wallets, official emails, live prices, and growth controls.
        </p>
      </div>

      <Island>
        <IslandHeader>
          <span className="font-medium">Deposit wallet addresses</span>
        </IslandHeader>
        <IslandBody>
          <form action={updateDepositWalletsAction} className="space-y-4">
            {wallets.map((w: any) => (
              <div
                key={w.asset}
                className="grid gap-3 rounded-xl border border-white/8 bg-white/5 p-3 sm:grid-cols-2"
              >
                <div className="sm:col-span-2 text-sm font-medium text-violet-300">
                  {w.asset}
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`address_${w.asset}`}>Address</Label>
                  <Input
                    id={`address_${w.asset}`}
                    name={`address_${w.asset}`}
                    defaultValue={w.address}
                    className="font-mono text-xs"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`network_${w.asset}`}>Network</Label>
                  <Input
                    id={`network_${w.asset}`}
                    name={`network_${w.asset}`}
                    defaultValue={w.network}
                    required
                  />
                </div>
              </div>
            ))}
            <Button type="submit">Save deposit wallets</Button>
          </form>
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">Official email addresses</span>
        </IslandHeader>
        <IslandBody>
          <form action={updateOfficialEmailsAction} className="space-y-3">
            <div>
              <Label htmlFor="email_contact">Contact email</Label>
              <Input
                id="email_contact"
                name="email_contact"
                type="email"
                defaultValue={emails.contact}
                required
              />
            </div>
            <div>
              <Label htmlFor="email_support">Support email</Label>
              <Input
                id="email_support"
                name="email_support"
                type="email"
                defaultValue={emails.support}
                required
              />
            </div>
            <div>
              <Label htmlFor="email_noreply">No-reply (transactional) email</Label>
              <Input
                id="email_noreply"
                name="email_noreply"
                type="email"
                defaultValue={emails.noreply}
                required
              />
              <p className="mt-1 text-xs text-white/35">
                Used as the From address for deposit, investment, and withdrawal
                notifications. Set <code className="text-violet-300">RESEND_API_KEY</code>{" "}
                to deliver via Resend; otherwise emails are logged under{" "}
                <code className="text-violet-300">data/emails/</code>.
              </p>
            </div>
            <Button type="submit">Save emails</Button>
          </form>
        </IslandBody>
      </Island>

      <div className="grid gap-4 lg:grid-cols-2">
        <Island>
          <IslandHeader>
            <span className="font-medium">Live crypto prices</span>
            <form action={refreshPricesAction}>
              <button
                type="submit"
                className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/15"
              >
                Refresh now
              </button>
            </form>
          </IslandHeader>
          <IslandBody className="space-y-2">
            {prices.map((p: any) => (
              <div
                key={p.asset}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"
              >
                <span className="font-medium">{p.asset}</span>
                <span className="tabular-nums text-emerald-300">
                  ${(p.priceUsdCents / 100).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  })}
                </span>
              </div>
            ))}
            <p className="text-xs text-white/35">
              Source: CoinGecko · cached in <code>price_snapshots</code>
            </p>
          </IslandBody>
        </Island>

        <Island>
          <IslandHeader>
            <span className="font-medium">Manage Portfolio APY Rules & Lock-up Multipliers</span>
            <form action={runGrowthAccrualAction}>
              <button
                type="submit"
                className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/15"
              >
                Run accrual
              </button>
            </form>
          </IslandHeader>
          <IslandBody>
            <form action={updateApyRulesAction} className="space-y-4">
              <div className="text-xs font-semibold uppercase text-violet-300">
                Tier APY Rates (%)
              </div>
              {rates.map((r: any) => (
                <div
                  key={r.tier}
                  className="rounded-xl border border-white/8 bg-white/5 p-3 space-y-2 text-xs"
                >
                  <div className="font-medium text-white text-sm capitalize">
                    {r.tier.replace("tier_", "Tier ≥ $").replace("500", "500").replace("2500", "2,500").replace("10000", "10,000")}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor={`current_${r.tier}`} className="text-[11px]">Current APY %</Label>
                      <Input
                        id={`current_${r.tier}`}
                        name={`current_${r.tier}`}
                        type="number"
                        step="0.1"
                        defaultValue={(r.currentApyBps / 100).toFixed(1)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`min_${r.tier}`} className="text-[11px]">Min Band APY %</Label>
                      <Input
                        id={`min_${r.tier}`}
                        name={`min_${r.tier}`}
                        type="number"
                        step="0.1"
                        defaultValue={(r.apyMinBps / 100).toFixed(1)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`max_${r.tier}`} className="text-[11px]">Max Band APY %</Label>
                      <Input
                        id={`max_${r.tier}`}
                        name={`max_${r.tier}`}
                        type="number"
                        step="0.1"
                        defaultValue={(r.apyMaxBps / 100).toFixed(1)}
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-2 text-xs font-semibold uppercase text-violet-300">
                Lock-up Multipliers (% of APY)
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <Label htmlFor="mult_90" className="text-[11px]">90-Day Lockup (%)</Label>
                  <Input
                    id="mult_90"
                    name="mult_90"
                    type="number"
                    step="1"
                    defaultValue={Math.round((mults[90] ?? 0.33) * 100)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="mult_180" className="text-[11px]">180-Day Lockup (%)</Label>
                  <Input
                    id="mult_180"
                    name="mult_180"
                    type="number"
                    step="1"
                    defaultValue={Math.round((mults[180] ?? 0.66) * 100)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="mult_365" className="text-[11px]">365-Day Lockup (%)</Label>
                  <Input
                    id="mult_365"
                    name="mult_365"
                    type="number"
                    step="1"
                    defaultValue={Math.round((mults[365] ?? 1.0) * 100)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full">
                Save APY Rules & Recalculate Portfolio Growth
              </Button>
            </form>
          </IslandBody>
        </Island>
      </div>

      <Island>
        <IslandHeader>
          <span className="font-medium">Recent transactional emails</span>
        </IslandHeader>
        <IslandBody className="space-y-2">
          {outbox.length === 0 && (
            <p className="text-sm text-white/40">No emails sent yet.</p>
          )}
          {outbox.map((e: any) => (
            <div
              key={e.id}
              className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{e.subject}</span>
                <span className="text-xs uppercase text-white/40">{e.status}</span>
              </div>
              <div className="mt-1 text-xs text-white/40">
                {e.kind} · to {e.toEmail} · {e.createdAt.slice(0, 16).replace("T", " ")}
              </div>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
