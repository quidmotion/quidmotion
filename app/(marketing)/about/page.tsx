import type { Metadata } from "next";
import { Island, IslandBody } from "@/components/ui/Island";

export const metadata: Metadata = { title: "About" };

const team = [
  {
    name: "Aaron Crowford",
    role: "Managing Partner",
    bio: "18 years originating and managing multifamily and mixed-use deals across major US metros.",
  },
  {
    name: "Sigrid Abdal",
    role: "Head of Acquisitions",
    bio: "Former fund analyst focused on underwriting cash-flowing residential portfolios.",
  },
  {
    name: "Sofia Bennet",
    role: "Compliance & Risk",
    bio: "Designs KYC/AML workflows and investor disclosure standards for the platform.",
  },
  {
    name: "Ron Sotton",
    role: "Head of Product",
    bio: "Fintech product lead shipping investor dashboards and modular service platforms.",
  },
];

const milestones = [
  { year: "2019", text: "Founding team closes first boutique RE fund." },
  { year: "2022", text: "Pilot crypto on-ramp for accredited partners." },
  { year: "2025", text: "QuidMotion platform design for broader access." },
  { year: "2026", text: "Product Launch." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">About QuidMotion</h1>
      <p className="mt-4 max-w-2xl text-lg text-white/60">
        We democratize access to professionally managed real estate by combining
        institutional underwriting with crypto-native funding rails — without the
        hype cycle.
      </p>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">Mission</h2>
        <Island className="mt-4">
          <IslandBody className="pt-5 text-white/70">
            Give everyday investors a transparent path into vetted property deals,
            with clear lock-ups, automatic portfolio growth, and rigorous KYC
          </IslandBody>
        </Island>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">Team</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {team.map((m: any) => (
            <Island key={m.name}>
              <IslandBody className="pt-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-pink-500/30 font-semibold">
                  {m.name
                    .split(" ")
                    .map((n: any) => n[0])
                    .join("")}
                </div>
                <h3 className="mt-3 font-medium">{m.name}</h3>
                <div className="text-sm text-violet-300">{m.role}</div>
                <p className="mt-2 text-sm text-white/50">{m.bio}</p>
              </IslandBody>
            </Island>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">Milestones</h2>
        <div className="mt-6 space-y-3">
          {milestones.map((m: any) => (
            <div
              key={m.year}
              className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
            >
              <div className="w-16 shrink-0 font-semibold text-violet-300">
                {m.year}
              </div>
              <div className="text-white/70">{m.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">Licensing & compliance</h2>
        <p className="mt-3 text-sm text-white/55">
          QuidMotion runs live KYC, deposits, growth accrual, and admin-reviewed withdrawals on local infrastructure today, with a documented path to Supabase. See our{" "}
          <a href="/documents/aml-kyc" className="text-violet-300 hover:underline">
            AML/KYC policy
          </a>{" "}
          and{" "}
          <a
            href="/documents/risk-disclosure"
            className="text-violet-300 hover:underline"
          >
            risk disclosure
          </a>
          .
        </p>
      </section>
    </div>
  );
}
