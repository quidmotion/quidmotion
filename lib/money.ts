/** Integer USD cents helpers — never store money as float. */

export type Cents = number & { readonly __brand: "Cents" };

export function toCents(usd: number): Cents {
  return Math.round(usd * 100) as Cents;
}

export function fromCents(cents: Cents | number): number {
  return cents / 100;
}

export function formatUsd(cents: Cents | number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(fromCents(cents));
}

export function formatUsdCompact(cents: Cents | number): string {
  const n = fromCents(cents);
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `$${(n / 1_000).toFixed(1)}K`;
  }
  return formatUsd(cents);
}

export function asCents(n: number): Cents {
  return Math.round(n) as Cents;
}
