import { cn } from "@/lib/utils/cn";

export function InvestmentDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-white/40", className)}>
      Projected returns are illustrative and not guaranteed. Real estate and
      crypto-related investments involve risk of loss. Past performance does not
      indicate future results. This is not financial, legal, or tax advice.
    </p>
  );
}

export function RiskCallout({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90",
        className,
      )}
    >
      <strong className="font-semibold">Risk notice:</strong> Capital is at risk.
      Lock-up periods apply.
    </div>
  );
}
