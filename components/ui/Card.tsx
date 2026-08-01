import { cn } from "@/lib/utils/cn";
import type { HTMLAttributes } from "react";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-white/15 hover:bg-white/[0.06]",
        className,
      )}
      {...props}
    />
  );
}
