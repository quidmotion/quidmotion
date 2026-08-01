import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "quidmotion",
    dbProvider: process.env.DB_PROVIDER ?? "local",
    authProvider: process.env.AUTH_PROVIDER ?? process.env.DB_PROVIDER ?? "local",
    time: new Date().toISOString(),
  });
}
