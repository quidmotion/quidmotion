function flag(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const features = {
  leadMagnet: flag("FF_LEAD_MAGNET", true),
  referrals: flag("FF_REFERRALS", true),
  /** Live CoinGecko (or cache) prices — on by default. */
  liveCryptoPrices: flag("FF_LIVE_CRYPTO_PRICES", true),
  walletConnect: flag("FF_WALLET_CONNECT", false),
  adminCms: flag("FF_ADMIN_CMS", true),
  exitIntentModal: flag("FF_EXIT_INTENT_MODAL", true),
  priceSource: (process.env.PRICE_SOURCE ?? "live") as "mock" | "live",
} as const;

export type Features = typeof features;
