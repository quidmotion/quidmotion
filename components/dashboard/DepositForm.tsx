"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { depositAction } from "@/lib/actions/dashboard";

export type DepositAddress = {
  asset: string;
  address: string;
  network: string;
};

type Price = { asset: string; priceUsdCents: number; asOf: string };

const DEFAULT_ASSETS: DepositAddress[] = [
  { asset: "USDT", address: "", network: "Ethereum (ERC-20)" },
  { asset: "USDC", address: "", network: "Ethereum (ERC-20)" },
  { asset: "BTC", address: "", network: "Bitcoin" },
  { asset: "ETH", address: "", network: "Ethereum" },
];

export function DepositForm({
  addresses = DEFAULT_ASSETS,
  initialPrices = [],
}: {
  addresses?: DepositAddress[];
  initialPrices?: Price[];
} = {}) {
  const walletList =
    addresses && addresses.length > 0 ? addresses : DEFAULT_ASSETS;
  const [amount, setAmount] = useState("1000");
  const [asset, setAsset] = useState(walletList[0]?.asset ?? "USDT");
  const [txRef, setTxRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const [prices, setPrices] = useState<Price[]>(initialPrices ?? []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/prices");
        const data = await res.json();
        if (!cancelled && data.ok) setPrices(data.prices);
      } catch {
        /* keep initial */
      }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const current = walletList.find((a) => a.asset === asset) ?? walletList[0];
  const price = prices.find((p) => p.asset === asset);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    start(async () => {
      const res = await depositAction(
        Number(amount),
        asset,
        txRef || undefined,
      );
      if (res.error) setError(res.error);
      else setOk(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label>Asset</Label>
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
        >
          {walletList.map((a) => (
            <option key={a.asset} value={a.asset} className="bg-[#12141c]">
              {a.asset}
            </option>
          ))}
        </select>
      </div>

      {current && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-3">
          <div className="text-xs uppercase text-white/40">
            Send {current.asset} on {current.network}
          </div>
          <code className="mt-2 block break-all font-mono text-xs text-violet-200">
            {current.address || "Not configured — contact admin"}
          </code>
          {price && (
            <div className="mt-2 text-xs text-white/45">
              Live price:{" "}
              <span className="tabular-nums text-emerald-300">
                $
                {(price.priceUsdCents / 100).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits:
                    price.asset === "USDT" || price.asset === "USDC" ? 4 : 2,
                })}
              </span>
              <span className="text-white/30">
                {" "}
                · updated {price.asOf.slice(11, 16)} UTC
              </span>
            </div>
          )}
        </div>
      )}

      <div>
        <Label>Amount sent (USD equivalent)</Label>
        <Input
          type="number"
          min={10}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Transaction hash / reference (recommended)</Label>
        <Input
          value={txRef}
          onChange={(e) => setTxRef(e.target.value)}
          placeholder="0x… or blockchain tx id"
          className="font-mono text-xs"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {ok && (
        <p className="text-sm text-emerald-400">
          Deposit submitted. Status: <strong>pending confirmation</strong>. An
          admin will verify the transfer and credit your balance. You will
          receive an email when credited.
        </p>
      )}
      <Button
        type="submit"
        disabled={pending || !current?.address}
        className="w-full"
      >
        {pending ? "Submitting…" : "I sent funds — submit for review"}
      </Button>
      <p className="text-[11px] leading-relaxed text-white/30">
        After transferring to the address above, submit this form. Your balance
        is credited only after admin confirmation (no automatic on-chain
        watcher yet). Always verify asset and network.
      </p>
    </form>
  );
}
