"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import {
  staffCloseConversationAction,
  staffGetThreadAction,
  staffListConversationsAction,
  staffReopenConversationAction,
  staffReplyAction,
} from "@/lib/actions/support-chat";
import type { ChatConversation, ChatMessage } from "@/lib/support/types";

const POLL_MS = 3000;

export function SupportInbox() {
  const [items, setItems] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [filter, setFilter] = useState<"all" | "open" | "pending" | "closed">(
    "all",
  );
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const refreshList = useCallback(async () => {
    const res = await staffListConversationsAction(filter);
    if (res.ok) setItems(res.items);
  }, [filter]);

  const loadThread = useCallback(async (id: string) => {
    const res = await staffGetThreadAction(id);
    if (res.ok) {
      setMessages(res.messages);
      setMeta(res.conversation);
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    }
  }, []);

  useEffect(() => {
    void refreshList();
    const id = setInterval(() => {
      void refreshList();
      if (selectedRef.current) void loadThread(selectedRef.current);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refreshList, loadThread]);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
  }, [selectedId, loadThread]);

  async function onReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await staffReplyAction(selectedId, body.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      if (res.messages) setMessages(res.messages);
      void refreshList();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr] xl:grid-cols-[minmax(0,20rem)_1fr]">
      <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
        <div className="flex gap-1 border-b border-white/10 p-2">
          {(["all", "open", "pending", "closed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-[11px] capitalize transition",
                filter === f
                  ? "bg-violet-500/25 text-violet-100"
                  : "text-white/45 hover:bg-white/8",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="p-4 text-sm text-white/40">No conversations.</p>
          )}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full border-b border-white/6 px-3 py-3 text-left transition hover:bg-white/6",
                selectedId === c.id && "bg-violet-500/15",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {c.userName || "Guest"}
                  </div>
                  <div className="truncate text-[11px] text-white/40">
                    {c.userEmail || "—"}
                  </div>
                </div>
                {(c.unreadCount ?? 0) > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-black">
                    {c.unreadCount}
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-xs text-white/50">
                {c.lastPreview || "No messages"}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-white/35">
                <span className="capitalize">{c.status}</span>
                <span>·</span>
                <span>{c.lastMessageAt?.slice(0, 16).replace("T", " ")}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-[28rem] flex-col rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-white/40">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {meta?.userName || "Conversation"}
                </div>
                <div className="truncate text-xs text-white/45">
                  {meta?.userEmail}
                  {meta?.userId ? (
                    <span className="text-white/30"> · user {meta.userId.slice(0, 8)}…</span>
                  ) : (
                    <span className="text-white/30"> · guest</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {meta?.status !== "closed" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await staffCloseConversationAction(selectedId);
                      void loadThread(selectedId);
                      void refreshList();
                    }}
                  >
                    Close
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await staffReopenConversationAction(selectedId);
                      void loadThread(selectedId);
                      void refreshList();
                    }}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            </div>

            <div
              ref={listRef}
              className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3"
            >
              {messages.map((m) => {
                const staff =
                  m.senderRole === "support" || m.senderRole === "admin";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex",
                      staff ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        staff
                          ? "rounded-br-md bg-gradient-to-br from-violet-500 to-pink-500"
                          : "rounded-bl-md border border-white/10 bg-white/8",
                      )}
                    >
                      <div className="mb-0.5 text-[10px] uppercase text-white/50">
                        {m.senderRole}
                      </div>
                      <div className="whitespace-pre-wrap break-words">
                        {m.body}
                      </div>
                      <div className="mt-1 text-[10px] text-white/40">
                        {m.createdAt.slice(0, 16).replace("T", " ")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {meta?.status !== "closed" && (
              <form
                onSubmit={onReply}
                className="border-t border-white/10 p-3 space-y-2"
              >
                {error && <p className="text-xs text-red-300">{error}</p>}
                <div className="flex gap-2">
                  <input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Reply as support…"
                    className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-violet-500/40"
                  />
                  <Button type="submit" disabled={sending || !body.trim()}>
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
