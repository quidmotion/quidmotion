"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { withdrawAction } from "@/lib/actions/dashboard";

export function WithdrawForm({
  kycApproved,
  availableUsd,
}: {
  kycApproved: boolean;
  availableUsd: number;
}) {
  const [amount, setAmount] = useState("100");
  const [address, setAddress] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [network, setNetwork] = useState("Ethereum (ERC-20)");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  function onAssetChange(next: string) {
    setAsset(next);
    if (next === "BTC") setNetwork("Bitcoin");
    else if (next === "ETH") setNetwork("Ethereum");
    else setNetwork("Ethereum (ERC-20)");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!kycApproved) {
      setError("KYC approval is required before requesting a withdrawal.");
      return;
    }
    start(async () => {
      const res = await withdrawAction(Number(amount), address, asset, network);
      if (res.error) setError(res.error);
      else setOk(true);
    });
  }

  if (!kycApproved) {
    return (
      <p className="text-sm text-amber-300">
        Only KYC-approved accounts can request withdrawals. Complete verification
        under Settings.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-white/40">
        Available to withdraw: ${availableUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </p>
      <div>
        <Label>Asset</Label>
        <select
          value={asset}
          onChange={(e) => onAssetChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
        >
          {["USDT", "USDC", "BTC", "ETH"].map((a) => (
            <option key={a} value={a} className="bg-[#12141c]">
              {a}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Network</Label>
        <Input
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Withdrawal address</Label>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Your wallet address"
          required
          className="font-mono text-xs"
        />
        <p className="mt-1 text-xs text-white/35">
          Double-check the address and network. Transfers are irreversible.
        </p>
      </div>
      <div>
        <Label>Amount (USD)</Label>
        <Input
          type="number"
          min={10}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {ok && (
        <p className="text-sm text-emerald-400">
          Withdrawal submitted. Status: <strong>pending approval</strong>. You
          will receive an email confirmation.
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Request withdrawal"}
      </Button>
    </form>
  );
}
