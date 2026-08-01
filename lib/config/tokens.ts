/**
 * Design tokens — single source of truth.
 * Components must use these (or Tailwind theme mapped to them), not raw hex.
 */

export const colors = {
  bg: {
    base: "#0a0b0f",
    elevated: "#12141c",
    island: "rgba(22, 24, 32, 0.72)",
    islandSolid: "#161820",
    overlay: "rgba(0, 0, 0, 0.55)",
  },
  border: {
    subtle: "rgba(255, 255, 255, 0.06)",
    default: "rgba(255, 255, 255, 0.10)",
    strong: "rgba(255, 255, 255, 0.16)",
  },
  text: {
    primary: "#f4f4f7",
    secondary: "#a1a1b5",
    muted: "#6b6b80",
    inverse: "#0a0b0f",
  },
  accent: {
    from: "#8b5cf6",
    to: "#ec4899",
    solid: "#a855f7",
    soft: "rgba(168, 85, 247, 0.15)",
  },
  success: {
    DEFAULT: "#22c55e",
    soft: "rgba(34, 197, 94, 0.15)",
  },
  warning: {
    DEFAULT: "#f59e0b",
    soft: "rgba(245, 158, 11, 0.15)",
  },
  danger: {
    DEFAULT: "#ef4444",
    soft: "rgba(239, 68, 68, 0.15)",
  },
} as const;

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
  full: "9999px",
} as const;

export const shadow = {
  subtle: "0 1px 2px rgba(0,0,0,0.24)",
  elevated: "0 8px 24px rgba(0,0,0,0.35)",
  floating: "0 16px 48px rgba(0,0,0,0.45)",
} as const;

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

export const motion = {
  duration: {
    fast: 150,
    normal: 250,
    slow: 400,
  },
  spring: {
    snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
    smooth: { type: "spring" as const, stiffness: 260, damping: 28 },
    gentle: { type: "spring" as const, stiffness: 180, damping: 24 },
  },
} as const;

export const fonts = {
  display: "var(--font-display), system-ui, sans-serif",
  body: "var(--font-body), system-ui, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;
