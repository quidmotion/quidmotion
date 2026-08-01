// app/api/lockup/route.ts
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { updateLockup } from "@/lib/actions/lockup";
import { LOCKUP_OPTIONS } from "@/lib/constants";

export async function POST(request: Request) {
  const auth = getAuth();
  const session = await auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { lockupDays } = await request.json();
  if (typeof lockupDays !== "number" || !(LOCKUP_OPTIONS as readonly number[]).includes(lockupDays)) {
    return NextResponse.json({ error: "Invalid lockup period" }, { status: 400 });
  }
  try {
    const validLockup = lockupDays as typeof LOCKUP_OPTIONS[number];
    await updateLockup(session.user.id, validLockup);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
