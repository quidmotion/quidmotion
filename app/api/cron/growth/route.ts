import { NextResponse } from "next/server";
import { accrueAllUsersGrowth, refreshDefaultPortfolioRates } from "@/lib/services/growth";
import { fetchLivePrices } from "@/lib/services/crypto";

export const dynamic = "force-dynamic";

/**
 * Hourly job: refresh default portfolio APY bands + accrue investment growth.
 * Secure with CRON_SECRET header when deployed.
 *
 * Example (crontab / Vercel cron):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/growth
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const rates = refreshDefaultPortfolioRates(true);
    const growth = accrueAllUsersGrowth();
    const prices = await fetchLivePrices();
    return NextResponse.json({
      ok: true,
      rates: rates.map((r: any) => ({
        tier: r.tier,
        currentApyBps: r.currentApyBps,
        updatedAt: r.updatedAt,
      })),
      growth: {
        usersProcessed: growth.usersProcessed,
        totalYieldCents: growth.totalYieldCents,
      },
      prices,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Cron failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
