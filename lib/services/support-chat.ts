import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  supportConversations,
  supportMessages,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { isAdmin, isStaff, type AuthUser, type Role } from "@/lib/auth/types";
import {
  assertPrivilege,
  loadActor,
  loadPrivileges,
} from "./_authz";
import { createNotification } from "./notifications";
import { hasPrivilegeInMap } from "@/lib/auth/privileges";
import type { ChatConversation, ChatMessage } from "@/lib/support/types";

export type { ChatConversation, ChatMessage };

const MAX_BODY = 4000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

const recentSends = new Map<string, number[]>();

function nowIso() {
  return new Date().toISOString();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sanitizeBody(body: string): string {
  const trimmed = body.trim().slice(0, MAX_BODY);
  if (!trimmed) throw new AppError("VALIDATION", "Message cannot be empty");
  return trimmed;
}

function rateLimit(key: string) {
  const now = Date.now();
  const arr = (recentSends.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    throw new AppError("RATE_LIMITED", "Too many messages. Please wait a moment.", 429);
  }
  arr.push(now);
  recentSends.set(key, arr);
}

function mapMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderRole: row.senderRole,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

async function getConversationRow(id: string) {
  const db = getDb();
  const rows = (await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.id, id))) as any[];
  return rows[0] ?? null;
}

/** Logged-in user: open or create their active conversation. */
export async function getOrCreateUserConversation(actorId: string) {
  const actor = await loadActor(actorId);
  if (isStaff(actor.role as Role)) {
    throw new AppError(
      "FORBIDDEN",
      "Staff use the support inbox, not the public chat widget",
      403,
    );
  }
  const db = getDb();
  const existing = (await db
    .select()
    .from(supportConversations)
    .where(
      and(
        eq(supportConversations.userId, actor.id),
        ne(supportConversations.status, "closed"),
      ),
    )
    .orderBy(desc(supportConversations.lastMessageAt))) as any[];

  if (existing[0]) return existing[0];

  const id = randomUUID();
  const now = nowIso();
  await db.insert(supportConversations).values({
    id,
    userId: actor.id,
    guestName: null,
    guestEmail: null,
    guestTokenHash: null,
    status: "open",
    assignedTo: null,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return (await getConversationRow(id))!;
}

/**
 * Guest: start conversation with name/email; returns opaque guest token
 * (caller stores in cookie).
 */
export async function startGuestConversation(input: {
  name: string;
  email: string;
  body: string;
}) {
  const name = input.name.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!name || !email) {
    throw new AppError("VALIDATION", "Name and email are required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("VALIDATION", "Invalid email");
  }
  const body = sanitizeBody(input.body);
  rateLimit(`guest:${email}`);

  const db = getDb();
  const guestToken = randomBytes(32).toString("hex");
  const id = randomUUID();
  const now = nowIso();

  await db.insert(supportConversations).values({
    id,
    userId: null,
    guestName: name,
    guestEmail: email,
    guestTokenHash: hashToken(guestToken),
    status: "open",
    assignedTo: null,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(supportMessages).values({
    id: randomUUID(),
    conversationId: id,
    senderId: null,
    senderRole: "guest",
    body,
    createdAt: now,
    readAt: null,
  });

  return { conversationId: id, guestToken };
}

export async function resumeGuestConversation(guestToken: string) {
  if (!guestToken) return null;
  const db = getDb();
  const rows = (await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.guestTokenHash, hashToken(guestToken)))) as any[];
  return rows[0] ?? null;
}

export async function sendUserMessage(
  actorId: string,
  conversationId: string,
  bodyRaw: string,
) {
  const actor = await loadActor(actorId);
  if (isStaff(actor.role as Role)) {
    throw new AppError("FORBIDDEN", "Use the support inbox to reply", 403);
  }
  const body = sanitizeBody(bodyRaw);
  rateLimit(`user:${actor.id}`);

  const conv = await getConversationRow(conversationId);
  if (!conv || conv.userId !== actor.id) {
    throw new AppError("NOT_FOUND", "Conversation not found", 404);
  }
  if (conv.status === "closed") {
    throw new AppError("INVALID_STATE", "This conversation is closed");
  }

  const db = getDb();
  const now = nowIso();
  const id = randomUUID();
  await db.insert(supportMessages).values({
    id,
    conversationId,
    senderId: actor.id,
    senderRole: "user",
    body,
    createdAt: now,
    readAt: null,
  });
  await db
    .update(supportConversations)
    .set({
      lastMessageAt: now,
      updatedAt: now,
      status: conv.status === "pending" ? "open" : conv.status,
    })
    .where(eq(supportConversations.id, conversationId));

  return mapMessage({
    id,
    conversationId,
    senderId: actor.id,
    senderRole: "user",
    body,
    createdAt: now,
    readAt: null,
  });
}

export async function sendGuestMessage(
  guestToken: string,
  bodyRaw: string,
) {
  const body = sanitizeBody(bodyRaw);
  const conv = await resumeGuestConversation(guestToken);
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  if (conv.status === "closed") {
    throw new AppError("INVALID_STATE", "This conversation is closed");
  }
  rateLimit(`guest:${conv.guestEmail ?? conv.id}`);

  const db = getDb();
  const now = nowIso();
  const id = randomUUID();
  await db.insert(supportMessages).values({
    id,
    conversationId: conv.id,
    senderId: null,
    senderRole: "guest",
    body,
    createdAt: now,
    readAt: null,
  });
  await db
    .update(supportConversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(supportConversations.id, conv.id));

  return mapMessage({
    id,
    conversationId: conv.id,
    senderId: null,
    senderRole: "guest",
    body,
    createdAt: now,
    readAt: null,
  });
}

export async function listMessagesForUser(
  actorId: string,
  conversationId: string,
) {
  const actor = await loadActor(actorId);
  const conv = await getConversationRow(conversationId);
  if (!conv || conv.userId !== actor.id) {
    throw new AppError("NOT_FOUND", "Conversation not found", 404);
  }
  return listMessagesInternal(conversationId);
}

export async function listMessagesForGuest(guestToken: string) {
  const conv = await resumeGuestConversation(guestToken);
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  return listMessagesInternal(conv.id);
}

async function listMessagesInternal(conversationId: string): Promise<ChatMessage[]> {
  const db = getDb();
  const rows = (await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.conversationId, conversationId))
    .orderBy(asc(supportMessages.createdAt))) as any[];
  return rows.map(mapMessage);
}

export async function markStaffMessagesRead(
  conversationId: string,
  reader: "user" | "guest" | "staff",
) {
  const db = getDb();
  const now = nowIso();
  if (reader === "staff") {
    // Mark user/guest messages as read
    await db
      .update(supportMessages)
      .set({ readAt: now })
      .where(
        and(
          eq(supportMessages.conversationId, conversationId),
          isNull(supportMessages.readAt),
          or(
            eq(supportMessages.senderRole, "user"),
            eq(supportMessages.senderRole, "guest"),
          ),
        ),
      );
  } else {
    await db
      .update(supportMessages)
      .set({ readAt: now })
      .where(
        and(
          eq(supportMessages.conversationId, conversationId),
          isNull(supportMessages.readAt),
          or(
            eq(supportMessages.senderRole, "support"),
            eq(supportMessages.senderRole, "admin"),
          ),
        ),
      );
  }
}

/** Staff inbox list. */
export async function listConversationsForStaff(
  actorId: string,
  opts: { status?: string } = {},
) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "chat.access");
  const db = getDb();

  let rows = (await db
    .select()
    .from(supportConversations)
    .orderBy(desc(supportConversations.lastMessageAt))) as any[];

  if (opts.status && opts.status !== "all") {
    rows = rows.filter((c: any) => c.status === opts.status);
  }

  return Promise.all(
    rows.map(async (c: any) => {
      let userName: string | null = c.guestName;
      let userEmail: string | null = c.guestEmail;
      if (c.userId) {
        const u = (await db
          .select()
          .from(users)
          .where(eq(users.id, c.userId))) as any[];
        if (u[0]) {
          userName = u[0].name;
          userEmail = u[0].email;
        }
      }
      const msgs = (await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.conversationId, c.id))
        .orderBy(desc(supportMessages.createdAt))) as any[];
      const last = msgs[0];
      const unread = msgs.filter(
        (m: any) =>
          !m.readAt &&
          (m.senderRole === "user" || m.senderRole === "guest"),
      ).length;
      return {
        id: c.id,
        userId: c.userId,
        guestName: c.guestName,
        guestEmail: c.guestEmail,
        status: c.status,
        assignedTo: c.assignedTo,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        userName,
        userEmail,
        unreadCount: unread,
        lastPreview: last?.body?.slice(0, 120) ?? null,
      } satisfies ChatConversation;
    }),
  );
}

export async function getConversationForStaff(
  actorId: string,
  conversationId: string,
) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "chat.access");
  const conv = await getConversationRow(conversationId);
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);

  const db = getDb();
  let userName = conv.guestName as string | null;
  let userEmail = conv.guestEmail as string | null;
  if (conv.userId) {
    const u = (await db
      .select()
      .from(users)
      .where(eq(users.id, conv.userId))) as any[];
    if (u[0]) {
      userName = u[0].name;
      userEmail = u[0].email;
    }
  }

  await markStaffMessagesRead(conversationId, "staff");
  const messages = await listMessagesInternal(conversationId);

  return {
    conversation: {
      ...conv,
      userName,
      userEmail,
    },
    messages,
  };
}

export async function sendStaffReply(
  actorId: string,
  conversationId: string,
  bodyRaw: string,
) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "chat.access");
  const body = sanitizeBody(bodyRaw);
  rateLimit(`staff:${actor.id}`);

  const conv = await getConversationRow(conversationId);
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  if (conv.status === "closed") {
    throw new AppError("INVALID_STATE", "Conversation is closed");
  }

  const db = getDb();
  const now = nowIso();
  const id = randomUUID();
  const senderRole = isAdmin(actor.role as Role) ? "admin" : "support";

  await db.insert(supportMessages).values({
    id,
    conversationId,
    senderId: actor.id,
    senderRole,
    body,
    createdAt: now,
    readAt: null,
  });
  await db
    .update(supportConversations)
    .set({
      lastMessageAt: now,
      updatedAt: now,
      status: "pending",
    })
    .where(eq(supportConversations.id, conversationId));

  // Notify logged-in user
  if (conv.userId) {
    try {
      await createNotification({
        userId: conv.userId,
        title: "Support replied",
        body: body.slice(0, 160),
        kind: "support",
      });
    } catch {
      // best-effort
    }
  }

  return mapMessage({
    id,
    conversationId,
    senderId: actor.id,
    senderRole,
    body,
    createdAt: now,
    readAt: null,
  });
}

export async function closeConversation(actorId: string, conversationId: string) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "chat.access");
  const conv = await getConversationRow(conversationId);
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  const now = nowIso();
  const db = getDb();
  await db
    .update(supportConversations)
    .set({ status: "closed", updatedAt: now })
    .where(eq(supportConversations.id, conversationId));
  return { ok: true };
}

export async function reopenConversation(actorId: string, conversationId: string) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "chat.access");
  const conv = await getConversationRow(conversationId);
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  const now = nowIso();
  const db = getDb();
  await db
    .update(supportConversations)
    .set({ status: "open", updatedAt: now })
    .where(eq(supportConversations.id, conversationId));
  return { ok: true };
}

/** Unread staff replies for widget badge (user or guest). */
export async function countUnreadForUser(actorId: string): Promise<number> {
  const actor = await loadActor(actorId);
  const db = getDb();
  const convs = (await db
    .select()
    .from(supportConversations)
    .where(
      and(
        eq(supportConversations.userId, actor.id),
        ne(supportConversations.status, "closed"),
      ),
    )) as any[];
  if (!convs.length) return 0;
  let total = 0;
  for (const c of convs) {
    const msgs = (await db
      .select()
      .from(supportMessages)
      .where(
        and(
          eq(supportMessages.conversationId, c.id),
          isNull(supportMessages.readAt),
          or(
            eq(supportMessages.senderRole, "support"),
            eq(supportMessages.senderRole, "admin"),
          ),
        ),
      )) as any[];
    total += msgs.length;
  }
  return total;
}

export async function countUnreadForGuest(guestToken: string): Promise<number> {
  const conv = await resumeGuestConversation(guestToken);
  if (!conv) return 0;
  const db = getDb();
  const msgs = (await db
    .select()
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.conversationId, conv.id),
        isNull(supportMessages.readAt),
        or(
          eq(supportMessages.senderRole, "support"),
          eq(supportMessages.senderRole, "admin"),
        ),
      ),
    )) as any[];
  return msgs.length;
}

export async function countOpenUnreadForStaff(actorId: string): Promise<number> {
  const actor = await loadActor(actorId);
  const map = await loadPrivileges(actor);
  if (!hasPrivilegeInMap(map, "chat.access") && !isAdmin(actor.role as Role)) {
    return 0;
  }
  const list = await listConversationsForStaff(actorId, { status: "all" });
  return list.reduce((s, c) => s + (c.unreadCount ?? 0), 0);
}

/** Widget poll payload for authenticated non-staff users. */
export async function pollUserChat(actorId: string) {
  const actor = await loadActor(actorId);
  if (isStaff(actor.role as Role)) {
    return { kind: "staff" as const, conversation: null, messages: [], unread: 0 };
  }
  const db = getDb();
  const existing = (await db
    .select()
    .from(supportConversations)
    .where(
      and(
        eq(supportConversations.userId, actor.id),
        ne(supportConversations.status, "closed"),
      ),
    )
    .orderBy(desc(supportConversations.lastMessageAt))) as any[];

  if (!existing[0]) {
    return { kind: "user" as const, conversation: null, messages: [], unread: 0 };
  }
  const messages = await listMessagesInternal(existing[0].id);
  const unread = await countUnreadForUser(actorId);
  return {
    kind: "user" as const,
    conversation: existing[0],
    messages,
    unread,
  };
}

export async function pollGuestChat(guestToken: string) {
  const conv = await resumeGuestConversation(guestToken);
  if (!conv) {
    return { kind: "guest" as const, conversation: null, messages: [], unread: 0 };
  }
  const messages = await listMessagesInternal(conv.id);
  return {
    kind: "guest" as const,
    conversation: conv,
    messages,
    unread: await countUnreadForGuest(guestToken),
  };
}
