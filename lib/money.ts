/** Integer USD cents helpers — never store money as float. */

export type Cents = number & { readonly __brand: "Cents" };

/** Soft sanity ceiling ($10M). Concat bugs often produce values far above this. */
export const SANITY_CENTS_MAX = 1_000_000_000;

/**
 * Coerce any DB/driver value (number, numeric string, bigint) to integer cents.
 * Postgres BIGINT via postgres.js often arrives as a string — using raw `+`
 * then concatenates instead of adding. Always coerce before arithmetic.
 *
 * Non-finite / unparseable values become 0 (with a warning).
 */
export function asCents(value: unknown): Cents {
  if (value == null || value === "") return 0 as Cents;
  if (typeof value === "bigint") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      console.warn("[money] asCents: bigint out of safe range", String(value));
      return 0 as Cents;
    }
    return Math.round(n) as Cents;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    console.warn("[money] asCents: non-finite value", value);
    return 0 as Cents;
  }
  return Math.round(n) as Cents;
}

/** Sum cents-like values with coercion (safe for string BIGINT rows). */
export function sumCents(...values: unknown[]): Cents {
  return asCents(values.reduce<number>((s, v) => s + asCents(v), 0));
}

/** Log-only guard when balances look like concat corruption. */
export function warnIfInsaneCents(
  label: string,
  cents: number,
  context?: Record<string, unknown>,
): void {
  if (Math.abs(cents) > SANITY_CENTS_MAX) {
    console.warn(`[money] sanity: ${label}=${cents}`, context ?? {});
  }
}

export function toCents(usd: number): Cents {
  return Math.round(usd * 100) as Cents;
}

export function fromCents(cents: Cents | number): number {
  return asCents(cents) / 100;
}

export function formatUsd(cents: Cents | number | unknown, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(fromCents(asCents(cents)));
}

export function formatUsdCompact(cents: Cents | number | unknown): string {
  const n = fromCents(asCents(cents));
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `$${(n / 1_000).toFixed(1)}K`;
  }
  return formatUsd(cents);
}
