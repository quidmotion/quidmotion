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
      className={cn("flex items-center justify-between gap-3 px-5 pt-5 pb-2", className)}
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
    <div className={cn("px-5 pb-5", className)} {...props}>
      {children}
    </div>
  );
}
