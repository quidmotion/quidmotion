"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { formatUsd } from "@/lib/money";
import { subscribeAction } from "@/lib/actions/dashboard";

type Plan = {
  id: string;
  name: string;
  minInvestmentCents: number;
  apyMinBps: number;
  apyMaxBps: number;
  lockupDays: number;
};

export function SubscribeForm({ plans }: { plans: Plan[] }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [amount, setAmount] = useState("1000");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    start(async () => {
      const res = await subscribeAction(planId, Number(amount));
      if (res.error) setError(res.error);
      else setOk(true);
    });
  }

  if (plans.length === 0) {
    return <p className="text-sm text-white/40">No plans available.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label>Plan</Label>
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#12141c]">
              {p.name} · min {formatUsd(p.minInvestmentCents)} ·{" "}
              {(p.apyMinBps / 100).toFixed(1)}–{(p.apyMaxBps / 100).toFixed(1)}%
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Amount (USD)</Label>
        <Input
          type="number"
          min={100}
          step={100}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {ok && (
        <p className="text-sm text-emerald-400">Subscription created.</p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Subscribe"}
      </Button>
    </form>
  );
}
