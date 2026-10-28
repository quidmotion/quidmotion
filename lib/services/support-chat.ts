import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
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

/** Staff inbox list. One conversation query, one message query, one user query. */
export async function listConversationsForStaff(
  actorId: string,
  opts: { status?: string } = {},
) {
  const actor = await loadActor(actorId);
  await assertPrivilege(actor, "chat.access");
  const db = getDb();

  const rows = (
    opts.status && opts.status !== "all"
      ? await db
          .select()
          .from(supportConversations)
          .where(eq(supportConversations.status, opts.status as "open"))
          .orderBy(desc(supportConversations.lastMessageAt))
      : await db
          .select()
          .from(supportConversations)
          .orderBy(desc(supportConversations.lastMessageAt))
  ) as any[];

  const ids = rows.map((c) => c.id as string);
  const userIds = [
    ...new Set(rows.map((c) => c.userId).filter(Boolean)),
  ] as string[];

  const [msgRows, userRows] = await Promise.all([
    ids.length
      ? ((await db
          .select()
          .from(supportMessages)
          .where(inArray(supportMessages.conversationId, ids))
          .orderBy(desc(supportMessages.createdAt))) as any[])
      : [],
    userIds.length
      ? ((await db
          .select()
          .from(users)
          .where(inArray(users.id, userIds))) as any[])
      : [],
  ]);

  const userById = new Map(userRows.map((u: any) => [u.id, u]));
  const grouped = new Map<string, any[]>();
  for (const m of msgRows) {
    const list = grouped.get(m.conversationId);
    if (list) list.push(m);
    else grouped.set(m.conversationId, [m]);
  }

  return rows.map((c: any) => {
    const msgs = grouped.get(c.id) ?? [];
    const last = msgs[0];
    const unread = msgs.filter(
      (m: any) =>
        !m.readAt && (m.senderRole === "user" || m.senderRole === "guest"),
    ).length;
    const u = c.userId ? userById.get(c.userId) : null;
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
      userName: u?.name ?? c.guestName,
      userEmail: u?.email ?? c.guestEmail,
      unreadCount: unread,
      lastPreview: last?.body?.slice(0, 120) ?? null,
    } satisfies ChatConversation;
  });
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
  const snap = await staffAlertSnapshot(actorId);
  return snap.access ? snap.unread : 0;
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

async function listMessagesSince(
  conversationId: string,
  since?: string | null,
): Promise<ChatMessage[]> {
  const db = getDb();
  const where = since
    ? and(
        eq(supportMessages.conversationId, conversationId),
        gt(supportMessages.createdAt, since),
      )
    : eq(supportMessages.conversationId, conversationId);
  const rows = (await db
    .select()
    .from(supportMessages)
    .where(where)
    .orderBy(asc(supportMessages.createdAt))) as any[];
  return rows.map(mapMessage);
}

async function countVisitorUnread(conversationId: string): Promise<number> {
  const db = getDb();
  const msgs = (await db
    .select()
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.conversationId, conversationId),
        isNull(supportMessages.readAt),
        or(
          eq(supportMessages.senderRole, "support"),
          eq(supportMessages.senderRole, "admin"),
        ),
      ),
    )) as any[];
  return msgs.length;
}

async function latestConversationForUser(userId: string) {
  const db = getDb();
  const rows = (await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.userId, userId))
    .orderBy(desc(supportConversations.lastMessageAt))) as any[];
  return rows.find((r) => r.status !== "closed") ?? rows[0] ?? null;
}

/** One cheap read for the visitor widget. Marks staff replies read only when asked. */
export async function pollVisitorThread(input: {
  userId: string | null;
  guestToken: string | null;
  since: string | null;
  markRead: boolean;
}): Promise<{
  kind: "user" | "guest" | "staff" | "anon";
  conversation: { id: string; status: string } | null;
  messages: ChatMessage[];
  unread: number;
}> {
  if (input.userId) {
    const actor = await loadActor(input.userId);
    if (isStaff(actor.role as Role)) {
      return { kind: "staff", conversation: null, messages: [], unread: 0 };
    }
    const conv = await latestConversationForUser(actor.id);
    if (!conv) {
      return { kind: "user", conversation: null, messages: [], unread: 0 };
    }
    if (input.markRead && conv.status !== "closed") {
      await markStaffMessagesRead(conv.id, "user");
    }
    const messages = await listMessagesSince(conv.id, input.since);
    const unread =
      input.markRead || conv.status === "closed"
        ? 0
        : await countVisitorUnread(conv.id);
    return {
      kind: "user",
      conversation: { id: conv.id, status: conv.status },
      messages,
      unread,
    };
  }

  if (input.guestToken) {
    const conv = await resumeGuestConversation(input.guestToken);
    if (!conv) {
      return { kind: "guest", conversation: null, messages: [], unread: 0 };
    }
    if (input.markRead && conv.status !== "closed") {
      await markStaffMessagesRead(conv.id, "guest");
    }
    const messages = await listMessagesSince(conv.id, input.since);
    const unread =
      input.markRead || conv.status === "closed"
        ? 0
        : await countVisitorUnread(conv.id);
    return {
      kind: "guest",
      conversation: { id: conv.id, status: conv.status },
      messages,
      unread,
    };
  }

  return { kind: "anon", conversation: null, messages: [], unread: 0 };
}

/** Visitor send. Reuses a closed guest's saved name and email for the next thread. */
export async function postVisitorMessage(input: {
  userId: string | null;
  guestToken: string | null;
  body: string;
  guestName?: string;
  guestEmail?: string;
}): Promise<{
  conversationId: string;
  messages: ChatMessage[];
  guestToken?: string;
}> {
  if (input.userId) {
    const actor = await loadActor(input.userId);
    if (isStaff(actor.role as Role)) {
      throw new AppError(
        "FORBIDDEN",
        "Staff should use the support inbox",
        403,
      );
    }
    const conv = await getOrCreateUserConversation(actor.id);
    await sendUserMessage(actor.id, conv.id, input.body);
    await markStaffMessagesRead(conv.id, "user");
    return {
      conversationId: conv.id,
      messages: await listMessagesInternal(conv.id),
    };
  }

  const token = input.guestToken;
  if (token) {
    const existing = await resumeGuestConversation(token);
    if (existing && existing.status !== "closed") {
      await sendGuestMessage(token, input.body);
      await markStaffMessagesRead(existing.id, "guest");
      return {
        conversationId: existing.id,
        messages: await listMessagesForGuest(token),
      };
    }
    if (existing?.guestName && existing?.guestEmail) {
      const started = await startGuestConversation({
        name: existing.guestName,
        email: existing.guestEmail,
        body: input.body,
      });
      return {
        conversationId: started.conversationId,
        guestToken: started.guestToken,
        messages: await listMessagesForGuest(started.guestToken),
      };
    }
  }

  if (!input.guestName?.trim() || !input.guestEmail?.trim()) {
    throw new AppError(
      "VALIDATION",
      "Please provide your name and email to start a chat",
    );
  }
  const started = await startGuestConversation({
    name: input.guestName,
    email: input.guestEmail,
    body: input.body,
  });
  return {
    conversationId: started.conversationId,
    guestToken: started.guestToken,
    messages: await listMessagesForGuest(started.guestToken),
  };
}

export async function getStaffThread(
  actorId: string,
  conversationId: string,
  opts: { since?: string | null; markRead?: boolean } = {},
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

  if (opts.markRead) await markStaffMessagesRead(conversationId, "staff");
  const messages = await listMessagesSince(conversationId, opts.since);
  const { guestTokenHash: _guestTokenHash, ...safe } = conv;

  return {
    conversation: { ...safe, userName, userEmail },
    messages,
  };
}

export type StaffAlertItem = {
  id: string;
  conversationId: string;
  body: string;
  createdAt: string;
  fromName: string;
};

/** Unread visitor messages for agents who are away from the inbox. */
export async function staffAlertSnapshot(actorId: string): Promise<{
  access: boolean;
  unread: number;
  items: StaffAlertItem[];
}> {
  const actor = await loadActor(actorId);
  const map = await loadPrivileges(actor);
  if (!hasPrivilegeInMap(map, "chat.access") && !isAdmin(actor.role as Role)) {
    return { access: false, unread: 0, items: [] };
  }
  const db = getDb();
  const msgs = (await db
    .select()
    .from(supportMessages)
    .where(
      and(
        isNull(supportMessages.readAt),
        or(
          eq(supportMessages.senderRole, "user"),
          eq(supportMessages.senderRole, "guest"),
        ),
      ),
    )
    .orderBy(desc(supportMessages.createdAt))) as any[];

  const top = msgs.slice(0, 15);
  const convIds = [...new Set(top.map((m) => m.conversationId as string))];
  const convs = convIds.length
    ? ((await db
        .select()
        .from(supportConversations)
        .where(inArray(supportConversations.id, convIds))) as any[])
    : [];
  const convById = new Map(convs.map((c) => [c.id, c]));
  const userIds = [
    ...new Set(convs.map((c) => c.userId).filter(Boolean)),
  ] as string[];
  const userRows = userIds.length
    ? ((await db
        .select()
        .from(users)
        .where(inArray(users.id, userIds))) as any[])
    : [];
  const userById = new Map(userRows.map((u: any) => [u.id, u]));

  return {
    access: true,
    unread: msgs.length,
    items: top.map((m) => {
      const conv = convById.get(m.conversationId);
      const fromName = conv?.userId
        ? (userById.get(conv.userId)?.name ?? "User")
        : (conv?.guestName ?? "Guest");
      return {
        id: m.id as string,
        conversationId: m.conversationId as string,
        body: String(m.body).slice(0, 180),
        createdAt: m.createdAt as string,
        fromName,
      };
    }),
  };
}
