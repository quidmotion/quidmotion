import { cn } from "@/lib/utils/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-lg shadow-violet-500/20 hover:brightness-110 active:scale-[0.98]",
  secondary:
    "bg-white/8 text-white border border-white/10 hover:bg-white/12 active:scale-[0.98]",
  ghost: "bg-transparent text-white/80 hover:bg-white/8 hover:text-white",
  danger: "bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-full",
  md: "h-10 px-5 text-sm rounded-full",
  lg: "h-12 px-6 text-base rounded-full",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
