export const dynamic = "force-dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Island, IslandBody } from "@/components/ui/Island";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InvestmentDisclaimer } from "@/components/shared/InvestmentDisclaimer";
import { formatUsd } from "@/lib/money";
import { getPlatformStats } from "@/lib/services/stats";
import { listPlans, type InvestmentPlan } from "@/lib/services/investments";
import { listFaq, type FaqEntry } from "@/lib/services/faq";

export default async function HomePage() {
  const stats = await getPlatformStats();
  const plans = (await listPlans()).slice(0, 3);
  const faqs = (await listFaq()).slice(0, 4);

  const steps = [
    {
      title: "Deposit crypto",
      body: "Fund your account with USDT, USDC, BTC, or ETH using live market prices.",
    },
    {
      title: "Choose a plan",
      body: "Pick Starter, Growth, or Elite based on lock-up and risk appetite.",
    },
    {
      title: "Experts invest",
      body: "Our real estate team deploys capital into vetted properties.",
    },
    {
      title: "Earn returns",
      body: "Track portfolio growth and scheduled payouts in your dashboard.",
    },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="absolute right-10 top-40 h-64 w-64 rounded-full bg-pink-500/15 blur-3xl" />
        </div>
        <div className="mx-auto max-w-4xl text-center">
          <Badge tone="accent" className="mb-6">
            Crypto-powered real estate
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Real Estate Investing,{" "}
            <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
              Powered by Crypto
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/60">
            Institutional-grade property expertise with the speed and
            accessibility of modern crypto rails — built for everyday investors.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register">
              <Button size="lg">Start Investing</Button>
            </Link>
            <Link href="/plans">
              <Button size="lg" variant="secondary">
                See how it works
              </Button>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total invested", value: formatUsd(stats.totalInvestedCents) },
            {
              label: "Avg. ROI",
              value: `${(stats.avgRoiBps / 100).toFixed(1)}%`,
            },
            { label: "Properties", value: String(stats.propertiesFunded) },
            { label: "Investors", value: String(stats.activeUsers) },
          ].map((s: any) => (
            <Island key={s.label}>
              <IslandBody className="py-4 text-center">
                <div className="text-xs uppercase tracking-wide text-white/40">
                  {s.label}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
                  {s.value}
                </div>
              </IslandBody>
            </Island>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="border-y border-white/5 bg-white/[0.02] px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-white/35">
          <span>15+ years RE experience</span>
          <span>Licensed professionals</span>
          <span>KYC / AML workflow</span>
          <span>Admin-reviewed withdrawals</span>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          How it works
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-white/55">
          Four clear steps from crypto deposit to property-backed returns.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Island key={step.title}>
              <IslandBody className="pt-5">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-sm font-semibold text-violet-300">
                  {i + 1}
                </div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-2 text-sm text-white/50">{step.body}</p>
              </IslandBody>
            </Island>
          ))}
        </div>
      </section>

      {/* Plans preview */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Investment plans
            </h2>
            <p className="mt-2 text-white/55">
              Choose a tier that matches your capital and time horizon.
            </p>
          </div>
          <Link href="/plans" className="text-sm text-violet-300 hover:text-violet-200">
            Compare all →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan: InvestmentPlan) => (
            <Card key={plan.id} className="flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <Badge tone="accent">{plan.riskTier}</Badge>
              </div>
              <p className="mt-2 flex-1 text-sm text-white/50">{plan.description}</p>
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Min</span>
                  <span className="tabular-nums">
                    {formatUsd(plan.minInvestmentCents)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Projected APY</span>
                  <span className="tabular-nums text-emerald-400">
                    {(plan.apyMinBps / 100).toFixed(1)}–
                    {(plan.apyMaxBps / 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Lock-up</span>
                  <span>{plan.lockupDays} days</span>
                </div>
              </div>
              <Link href="/register" className="mt-5">
                <Button className="w-full" variant="secondary">
                  Get started
                </Button>
              </Link>
            </Card>
          ))}
        </div>
        <div className="mt-4">
          <InvestmentDisclaimer />
        </div>
      </section>

      {/* Team teaser */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-semibold">Built by operators</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-white/55">
          Seasoned real estate professionals and fintech builders — not hype.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { name: "Aaron Crowford", role: "Managing Partner · 18 yrs RE" },
            { name: "Sigrid Abdal", role: "Head of Acquisitions" },
            { name: "Sofia Bennet", role: "Compliance & Risk" },
          ].map((m: any) => (
            <Island key={m.name}>
              <IslandBody className="flex items-center gap-4 pt-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/40 to-pink-500/40 text-sm font-semibold">
                  {m.name
                    .split(" ")
                    .map((n: any) => n[0])
                    .join("")}
                </div>
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-sm text-white/45">{m.role}</div>
                </div>
              </IslandBody>
            </Island>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/about" className="text-sm text-violet-300 hover:text-violet-200">
            Meet the full team →
          </Link>
        </div>
      </section>

      {/* FAQ teaser */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h2 className="text-center text-3xl font-semibold">FAQ</h2>
        <div className="mt-8 space-y-3">
          {faqs.map((f: FaqEntry) => (
            <Island key={f.id}>
              <IslandBody className="pt-4">
                <h3 className="font-medium">{f.question}</h3>
                <p className="mt-2 text-sm text-white/50 line-clamp-2">{f.answer}</p>
              </IslandBody>
            </Island>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/faq">
            <Button variant="secondary">View all FAQs</Button>
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <Island className="mx-auto max-w-4xl overflow-hidden">
          <IslandBody className="relative py-12 text-center">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-600/20 to-pink-600/20" />
            <div className="relative">
              <h2 className="text-3xl font-semibold">Limited allocation this quarter</h2>
              <p className="mx-auto mt-3 max-w-lg text-white/55">
                Open an account, complete KYC, and start with as little as $500 in
                the Starter plan.
              </p>
              <Link href="/register" className="mt-6 inline-block">
                <Button size="lg">Create free account</Button>
              </Link>
            </div>
          </IslandBody>
        </Island>
      </section>
    </div>
  );
}
