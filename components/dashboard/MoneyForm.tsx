"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions/dashboard";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export function MoneyForm({
  action,
  submitLabel,
  showAsset,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
  showAsset?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div>
        <Label htmlFor="amountUsd">Amount (USD)</Label>
        <Input
          id="amountUsd"
          name="amountUsd"
          type="number"
          min={1}
          step="1"
          defaultValue={500}
          required
        />
      </div>
      {showAsset ? (
        <div>
          <Label htmlFor="asset">Asset</Label>
          <select
            id="asset"
            name="asset"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none"
            defaultValue="USDT"
          >
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
          </select>
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Processing…" : submitLabel}
      </Button>
      {state && !state.ok ? (
        <p className="text-sm text-red-300">{state.error}</p>
      ) : null}
      {state && state.ok ? (
        <p className="text-sm text-emerald-300">{state.message}</p>
      ) : null}
    </form>
  );
}
