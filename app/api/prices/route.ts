import { NextResponse } from "next/server";
import { getPrices, fetchLivePrices } from "@/lib/services/crypto";

export const dynamic = "force-dynamic";

/** Public live price feed for BTC, ETH, USDT, USDC, etc. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  try {
    const prices = refresh ? await fetchLivePrices() : await getPrices();
    return NextResponse.json({
      ok: true,
      asOf: new Date().toISOString(),
      prices,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to load prices",
      },
      { status: 500 },
    );
  }
}
