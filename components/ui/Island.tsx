import { cn } from "@/lib/utils/cn";
import type { HTMLAttributes } from "react";

export function Island({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-[rgba(22,24,32,0.72)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function IslandHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2 sm:gap-3 sm:px-5 sm:pt-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function IslandBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-4 pb-4 sm:px-5 sm:pb-5", className)} {...props}>
      {children}
    </div>
  );
}
