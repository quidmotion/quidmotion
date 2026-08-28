"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { transferAction } from "@/lib/actions/dashboard";

export function TransferForm({
  kycApproved,
  availableUsd,
}: {
  kycApproved: boolean;
  availableUsd: number;
}) {
  const [amount, setAmount] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!kycApproved) {
      setError("KYC approval is required before transferring.");
      return;
    }
    const usd = Number(amount);
    if (!Number.isFinite(usd) || usd <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    start(async () => {
      const res = await transferAction(usd, toEmail, note || undefined);
      if (res.error) setError(res.error);
      else {
        setOk(true);
        setAmount("");
        setNote("");
      }
    });
  }

  if (!kycApproved) {
    return (
      <p className="text-sm text-amber-300">
        Only KYC-approved accounts can transfer available balance to other
        verified users. Complete verification under Settings.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-white/40">
        Available to transfer: $
        {availableUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </p>
      <div>
        <Label htmlFor="toEmail">Recipient email</Label>
        <Input
          id="toEmail"
          type="email"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          placeholder="user@example.com"
          required
          autoComplete="email"
        />
        <p className="mt-1 text-xs text-white/35">
          Recipient must be a KYC-approved QuidMotion account. Transfers are
          held for admin review before the recipient is credited.
        </p>
      </div>
      <div>
        <Label htmlFor="amount">Amount (USD)</Label>
        <div className="flex gap-2">
          <Input
            id="amount"
            type="number"
            min={1}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
          />
          <Button
            type="button"
            variant="ghost"
            className="shrink-0 px-3"
            onClick={() =>
              setAmount(
                availableUsd > 0
                  ? (Math.floor(availableUsd * 100) / 100).toFixed(2)
                  : "",
              )
            }
            disabled={availableUsd <= 0}
          >
            Max
          </Button>
        </div>
        <p className="mt-1 text-xs text-white/35">Minimum $1.00</p>
      </div>
      <div>
        <Label htmlFor="note">Note (optional)</Label>
        <Input
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What is this for?"
          maxLength={200}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {ok && (
        <p className="text-sm text-emerald-400">
          Transfer submitted for admin review. Funds are reserved from your
          available balance until it is approved or declined.
        </p>
      )}
      <Button type="submit" disabled={pending || availableUsd < 1} className="w-full">
        {pending ? "Submitting…" : "Submit transfer"}
      </Button>
    </form>
  );
}
