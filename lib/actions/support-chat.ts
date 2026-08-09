"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth, isStaff } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import * as chat from "@/lib/services/support-chat";
import type { ChatConversation, ChatMessage } from "@/lib/support/types";

export type ChatActionResult =
  | {
      ok: true;
      message?: string;
      conversationId?: string;
      messages?: ChatMessage[];
      unread?: number;
    }
  | { ok: false; error: string };

const GUEST_COOKIE = "qm_support_guest";

function fail(e: unknown): ChatActionResult {
  return {
    ok: false,
    error: isAppError(e)
      ? e.message
      : e instanceof Error
        ? e.message
        : "Chat action failed",
  };
}

async function getGuestToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(GUEST_COOKIE)?.value ?? null;
}

async function setGuestToken(token: string) {
  const jar = await cookies();
  jar.set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function pollChatAction(): Promise<{
  kind: "user" | "guest" | "staff" | "anon";
  conversation: any | null;
  messages: ChatMessage[];
  unread: number;
  hideWidget?: boolean;
}> {
  const session = await getAuth().getSession();
  if (session?.user) {
    if (isStaff(session.user.role)) {
      return {
        kind: "staff",
        conversation: null,
        messages: [],
        unread: 0,
        hideWidget: true,
      };
    }
    const data = await chat.pollUserChat(session.user.id);
    return {
      kind: "user",
      conversation: data.conversation,
      messages: data.messages,
      unread: data.unread,
    };
  }

  const token = await getGuestToken();
  if (token) {
    const data = await chat.pollGuestChat(token);
    return {
      kind: "guest",
      conversation: data.conversation,
      messages: data.messages,
      unread: data.unread,
    };
  }

  return { kind: "anon", conversation: null, messages: [], unread: 0 };
}

export async function startOrSendChatAction(input: {
  body: string;
  guestName?: string;
  guestEmail?: string;
}): Promise<ChatActionResult> {
  try {
    const session = await getAuth().getSession();
    if (session?.user) {
      if (isStaff(session.user.role)) {
        return { ok: false, error: "Staff should use the support inbox" };
      }
      const conv = await chat.getOrCreateUserConversation(session.user.id);
      await chat.sendUserMessage(session.user.id, conv.id, input.body);
      const messages = await chat.listMessagesForUser(session.user.id, conv.id);
      await chat.markStaffMessagesRead(conv.id, "user");
      return { ok: true, conversationId: conv.id, messages };
    }

    // Guest path
    let token = await getGuestToken();
    if (token) {
      const existing = await chat.resumeGuestConversation(token);
      if (existing && existing.status !== "closed") {
        await chat.sendGuestMessage(token, input.body);
        const messages = await chat.listMessagesForGuest(token);
        await chat.markStaffMessagesRead(existing.id, "guest");
        return { ok: true, conversationId: existing.id, messages };
      }
    }

    if (!input.guestName?.trim() || !input.guestEmail?.trim()) {
      return {
        ok: false,
        error: "Please provide your name and email to start a chat",
      };
    }

    const started = await chat.startGuestConversation({
      name: input.guestName,
      email: input.guestEmail,
      body: input.body,
    });
    await setGuestToken(started.guestToken);
    const messages = await chat.listMessagesForGuest(started.guestToken);
    return {
      ok: true,
      conversationId: started.conversationId,
      messages,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function markChatReadAction(): Promise<ChatActionResult> {
  try {
    const session = await getAuth().getSession();
    if (session?.user && !isStaff(session.user.role)) {
      const data = await chat.pollUserChat(session.user.id);
      if (data.conversation) {
        await chat.markStaffMessagesRead(data.conversation.id, "user");
      }
      return { ok: true };
    }
    const token = await getGuestToken();
    if (token) {
      const conv = await chat.resumeGuestConversation(token);
      if (conv) await chat.markStaffMessagesRead(conv.id, "guest");
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function staffListConversationsAction(status?: string) {
  const session = await getAuth().getSession();
  if (!session) return { ok: false as const, error: "Sign in required", items: [] };
  try {
    const items = await chat.listConversationsForStaff(session.user.id, {
      status: status || "all",
    });
    return { ok: true as const, items };
  } catch (e) {
    return {
      ok: false as const,
      error: isAppError(e) ? e.message : "Failed to load",
      items: [] as ChatConversation[],
    };
  }
}

export async function staffGetThreadAction(conversationId: string) {
  const session = await getAuth().getSession();
  if (!session) return { ok: false as const, error: "Sign in required" };
  try {
    const data = await chat.getConversationForStaff(
      session.user.id,
      conversationId,
    );
    return { ok: true as const, ...data };
  } catch (e) {
    return {
      ok: false as const,
      error: isAppError(e) ? e.message : "Failed to load thread",
    };
  }
}

export async function staffReplyAction(
  conversationId: string,
  body: string,
): Promise<ChatActionResult> {
  try {
    const session = await getAuth().getSession();
    if (!session) return { ok: false, error: "Sign in required" };
    await chat.sendStaffReply(session.user.id, conversationId, body);
    const data = await chat.getConversationForStaff(
      session.user.id,
      conversationId,
    );
    revalidatePath("/admin/support");
    return { ok: true, messages: data.messages, conversationId };
  } catch (e) {
    return fail(e);
  }
}

export async function staffCloseConversationAction(
  conversationId: string,
): Promise<ChatActionResult> {
  try {
    const session = await getAuth().getSession();
    if (!session) return { ok: false, error: "Sign in required" };
    await chat.closeConversation(session.user.id, conversationId);
    revalidatePath("/admin/support");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function staffReopenConversationAction(
  conversationId: string,
): Promise<ChatActionResult> {
  try {
    const session = await getAuth().getSession();
    if (!session) return { ok: false, error: "Sign in required" };
    await chat.reopenConversation(session.user.id, conversationId);
    revalidatePath("/admin/support");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
