export const dynamic = "force-dynamic";

import {
  getDepositWallets,
  getOfficialEmails,
} from "@/lib/services/settings";
import {
  listDefaultPortfolioRates,
  getLockupMultipliers,
} from "@/lib/services/growth";
import { listRecentPrices } from "@/lib/services/crypto";
import {
  isGmailAddress,
  isGmailSmtpConfigured,
  isResendConfigured,
  listEmailOutbox,
} from "@/lib/services/email";
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
import { requireAdminPath, staffHasPrivilege } from "@/lib/admin/guard";

export default async function AdminSettingsPage() {
  const ctx = await requireAdminPath("/admin/settings");
  const canWallets = await staffHasPrivilege(ctx, "settings.wallets");
  const canEmails = await staffHasPrivilege(ctx, "settings.emails");
  const canApy = await staffHasPrivilege(ctx, "settings.apy");
  const isAdmin = ctx.isFullAdmin;

  const wallets = canWallets ? await getDepositWallets() : [];
  const emails = canEmails ? await getOfficialEmails() : null;
  const rates = canApy ? await listDefaultPortfolioRates() : [];
  const mults = canApy ? await getLockupMultipliers() : {};
  const prices = isAdmin || canApy ? await listRecentPrices() : [];
  const outbox = isAdmin
    ? await listEmailOutbox(ctx.user.id, 15).catch(() => [])
    : [];
  const resendConfigured = isResendConfigured();
  const gmailConfigured = isGmailSmtpConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Platform settings</h1>
        <p className="text-xs text-white/45 sm:text-sm">
          Deposit wallets, official emails, live prices, and growth controls.
        </p>
      </div>

      {canWallets && (
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
      )}

      {canEmails && emails && (
        <Island>
          <IslandHeader>
            <span className="font-medium">Official email addresses</span>
          </IslandHeader>
          <IslandBody>
            <form action={updateOfficialEmailsAction} className="space-y-3">
              <fieldset>
                <legend className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50">
                  Mail transport
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer gap-3 rounded-xl border border-white/8 bg-white/5 p-3 has-[:checked]:border-violet-500/50 has-[:checked]:bg-violet-500/10">
                    <input
                      type="radio"
                      name="email_provider"
                      value="gmail_smtp"
                      defaultChecked={emails.provider === "gmail_smtp"}
                      className="mt-1 accent-violet-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">
                        Gmail SMTP
                      </span>
                      <span className="mt-0.5 block text-xs text-white/45">
                        Send through Gmail until you have a verified domain.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer gap-3 rounded-xl border border-white/8 bg-white/5 p-3 has-[:checked]:border-violet-500/50 has-[:checked]:bg-violet-500/10">
                    <input
                      type="radio"
                      name="email_provider"
                      value="resend"
                      defaultChecked={emails.provider === "resend"}
                      className="mt-1 accent-violet-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">
                        Custom domain
                      </span>
                      <span className="mt-0.5 block text-xs text-white/45">
                        Send through Resend from a domain verified in Resend.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>
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
                <Label htmlFor="email_noreply">
                  No-reply (transactional) email
                </Label>
                <Input
                  id="email_noreply"
                  name="email_noreply"
                  type="email"
                  defaultValue={emails.noreply}
                  required
                />
                <p className="mt-1 text-xs text-white/35">
                  Used as the From address for deposit, investment, withdrawal,
                  KYC, and password-reset emails.
                </p>
                {emails.provider === "gmail_smtp" &&
                  !isGmailAddress(emails.noreply) && (
                    <p className="mt-2 text-xs text-amber-300/80">
                      Gmail SMTP is selected. Set no-reply to this Gmail mailbox
                      (or a Google alias). Gmail will reject or rewrite other
                      From addresses.
                    </p>
                  )}
                {emails.provider === "resend" &&
                  isGmailAddress(emails.noreply) && (
                    <p className="mt-2 text-xs text-amber-300/80">
                      Custom domain is selected. Resend cannot send from
                      @gmail.com — use an address on a domain verified in
                      Resend.
                    </p>
                  )}
                <p
                  className={`mt-2 text-xs ${
                    emails.provider === "gmail_smtp"
                      ? gmailConfigured
                        ? "text-emerald-300/80"
                        : "text-amber-300/80"
                      : resendConfigured
                        ? "text-emerald-300/80"
                        : "text-amber-300/80"
                  }`}
                >
                  {emails.provider === "gmail_smtp"
                    ? gmailConfigured
                      ? "Gmail SMTP is configured. Transactional email is delivered to users."
                      : "Gmail SMTP is selected but GMAIL_APP_PASSWORD is not set in .env.local (and your host env)."
                    : resendConfigured
                      ? "Resend is configured. Transactional email is delivered to users."
                      : "Custom domain is selected but RESEND_API_KEY is not set. Emails are only logged under data/emails/."}
                </p>
              </div>
              <Button type="submit">Save emails</Button>
            </form>
          </IslandBody>
        </Island>
      )}

      {(isAdmin || canApy) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {isAdmin && (
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
                      $
                      {(p.priceUsdCents / 100).toLocaleString(undefined, {
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
          )}

          {canApy && (
            <Island className={!isAdmin ? "lg:col-span-2" : undefined}>
              <IslandHeader>
                <span className="min-w-0 text-sm font-medium sm:text-base">
                  Portfolio APY & lock-up
                </span>
                {isAdmin && (
                  <form action={runGrowthAccrualAction}>
                    <button
                      type="submit"
                      className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/15"
                    >
                      Run accrual
                    </button>
                  </form>
                )}
              </IslandHeader>
              <IslandBody>
                <form action={updateApyRulesAction} className="space-y-4">
                  <div className="text-xs font-semibold uppercase text-violet-300">
                    Tier APY Rates (%)
                  </div>
                  {rates.map((r: any) => (
                    <div
                      key={r.tier}
                      className="space-y-2 rounded-xl border border-white/8 bg-white/5 p-3 text-xs"
                    >
                      <div className="text-sm font-medium capitalize text-white">
                        {r.tier
                          .replace("tier_", "Tier ≥ $")
                          .replace("500", "500")
                          .replace("2500", "2,500")
                          .replace("10000", "10,000")}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div>
                          <Label
                            htmlFor={`current_${r.tier}`}
                            className="text-[11px]"
                          >
                            Current APY %
                          </Label>
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
                          <Label
                            htmlFor={`min_${r.tier}`}
                            className="text-[11px]"
                          >
                            Min Band APY %
                          </Label>
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
                          <Label
                            htmlFor={`max_${r.tier}`}
                            className="text-[11px]"
                          >
                            Max Band APY %
                          </Label>
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
                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                    <div>
                      <Label htmlFor="mult_90" className="text-[11px]">
                        90-Day Lockup (%)
                      </Label>
                      <Input
                        id="mult_90"
                        name="mult_90"
                        type="number"
                        step="1"
                        defaultValue={Math.round(
                          ((mults as any)[90] ?? 0.33) * 100,
                        )}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="mult_180" className="text-[11px]">
                        180-Day Lockup (%)
                      </Label>
                      <Input
                        id="mult_180"
                        name="mult_180"
                        type="number"
                        step="1"
                        defaultValue={Math.round(
                          ((mults as any)[180] ?? 0.66) * 100,
                        )}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="mult_365" className="text-[11px]">
                        365-Day Lockup (%)
                      </Label>
                      <Input
                        id="mult_365"
                        name="mult_365"
                        type="number"
                        step="1"
                        defaultValue={Math.round(
                          ((mults as any)[365] ?? 1.0) * 100,
                        )}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full text-center leading-tight">
                    <span className="sm:hidden">Save APY rules</span>
                    <span className="hidden sm:inline">
                      Save APY Rules & Recalculate Portfolio Growth
                    </span>
                  </Button>
                </form>
              </IslandBody>
            </Island>
          )}
        </div>
      )}

      {isAdmin && (
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
                  <span className="text-xs uppercase text-white/40">
                    {e.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/40">
                  {e.kind} · to {e.toEmail} ·{" "}
                  {e.createdAt.slice(0, 16).replace("T", " ")}
                </div>
              </div>
            ))}
          </IslandBody>
        </Island>
      )}
    </div>
  );
}
