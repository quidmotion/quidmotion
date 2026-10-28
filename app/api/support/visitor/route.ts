import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import {
  pollVisitorThread,
  postVisitorMessage,
} from "@/lib/services/support-chat";

export const dynamic = "force-dynamic";

const GUEST_COOKIE = "qm_support_guest";

function fail(e: unknown) {
  const message = isAppError(e)
    ? e.message
    : e instanceof Error
      ? e.message
      : "Chat request failed";
  const status = isAppError(e) ? e.status : 400;
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const session = await getAuth().getSession();
    const userId = session?.user?.id ?? null;
    const jar = await cookies();
    const guestToken = jar.get(GUEST_COOKIE)?.value ?? null;
    const op = body?.op === "send" ? "send" : "poll";

    if (op === "poll") {
      const data = await pollVisitorThread({
        userId,
        guestToken,
        since: typeof body?.since === "string" ? body.since : null,
        markRead: body?.markRead === true,
      });
      return NextResponse.json(data);
    }

    const result = await postVisitorMessage({
      userId,
      guestToken,
      body: String(body?.body ?? ""),
      guestName: typeof body?.guestName === "string" ? body.guestName : undefined,
      guestEmail:
        typeof body?.guestEmail === "string" ? body.guestEmail : undefined,
    });
    if (result.guestToken) {
      jar.set(GUEST_COOKIE, result.guestToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return NextResponse.json({
      ok: true,
      conversationId: result.conversationId,
      messages: result.messages,
    });
  } catch (e) {
    return fail(e);
  }
}
