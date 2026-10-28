import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import * as chat from "@/lib/services/support-chat";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  const message = isAppError(e)
    ? e.message
    : e instanceof Error
      ? e.message
      : "Chat request failed";
  const status = isAppError(e) ? e.status : 400;
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function actorId() {
  const session = await getAuth().getSession();
  return session?.user?.id ?? null;
}

export async function GET(req: Request) {
  const id = await actorId();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Sign in required" },
      { status: 401 },
    );
  }
  const url = new URL(req.url);
  const op = url.searchParams.get("op") ?? "alerts";
  try {
    if (op === "inbox") {
      const items = await chat.listConversationsForStaff(id, {
        status: url.searchParams.get("status") ?? "all",
      });
      return NextResponse.json({ ok: true, items });
    }
    if (op === "thread") {
      const data = await chat.getStaffThread(id, url.searchParams.get("id") ?? "", {
        since: url.searchParams.get("since"),
        markRead: url.searchParams.get("markRead") === "1",
      });
      return NextResponse.json({ ok: true, ...data });
    }
    const snap = await chat.staffAlertSnapshot(id);
    return NextResponse.json({ ok: true, ...snap });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const id = await actorId();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Sign in required" },
      { status: 401 },
    );
  }
  try {
    const body = await req.json();
    const conversationId = String(body?.conversationId ?? "");
    if (body?.op === "reply") {
      await chat.sendStaffReply(id, conversationId, String(body?.body ?? ""));
      const data = await chat.getStaffThread(id, conversationId, { markRead: true });
      return NextResponse.json({
        ok: true,
        messages: data.messages,
        conversation: data.conversation,
      });
    }
    if (body?.op === "close") {
      await chat.closeConversation(id, conversationId);
      return NextResponse.json({ ok: true, message: "Conversation closed" });
    }
    if (body?.op === "reopen") {
      await chat.reopenConversation(id, conversationId);
      return NextResponse.json({ ok: true, message: "Conversation reopened" });
    }
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
