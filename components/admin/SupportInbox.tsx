"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import type { ChatConversation, ChatMessage } from "@/lib/support/types";
import { formatChatTime } from "@/lib/support/client";
import { pushToast, updateToast } from "@/components/feedback/toast-bus";

const CANNED = [
  "Thanks — we're looking into this now.",
  "Please send the transaction id or the wallet address you used.",
  "Your KYC is in review. We'll update you here once it's decided.",
  "That withdrawal is queued for review. You can track it under Withdrawals.",
];

type UiMessage = ChatMessage & { pending?: boolean };

function mergeMessages(prev: UiMessage[], incoming: UiMessage[], replace: boolean) {
  const pending = prev.filter((m) => m.pending);
  if (replace) return [...incoming, ...pending];
  const map = new Map<string, UiMessage>();
  for (const message of prev) {
    if (!message.pending) map.set(message.id, message);
  }
  for (const message of incoming) map.set(message.id, message);
  return [...map.values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .concat(pending);
}

export function SupportInbox() {
  const [items, setItems] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [meta, setMeta] = useState<ChatConversation | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedId);
  const sinceRef = useRef<Record<string, string>>({});
  selectedRef.current = selectedId;

  const refreshList = useCallback(async () => {
    const res = await fetch(
      `/api/support/staff?op=inbox&status=${encodeURIComponent(filter)}`,
      { credentials: "same-origin" },
    );
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) setItems(data.items);
  }, [filter]);

  const loadThread = useCallback(async (id: string, full = false) => {
    const since = full ? "" : (sinceRef.current[id] ?? "");
    const markRead = document.visibilityState === "visible" ? "1" : "0";
    const res = await fetch(
      `/api/support/staff?op=thread&id=${encodeURIComponent(id)}&since=${encodeURIComponent(since)}&markRead=${markRead}`,
      { credentials: "same-origin" },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) return;
    if (selectedRef.current !== id) return;
    setMeta(data.conversation);
    const incoming = (data.messages ?? []) as UiMessage[];
    setMessages((prev) => mergeMessages(prev, incoming, !since));
    const last = incoming[incoming.length - 1];
    if (last && (!sinceRef.current[id] || last.createdAt > sinceRef.current[id])) {
      sinceRef.current[id] = last.createdAt;
    }
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }, []);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("c");
    if (fromQuery) setSelectedId(fromQuery);
    const onFocus = (event: Event) => {
      const id = (event as CustomEvent<{ conversationId?: string }>).detail
        ?.conversationId;
      if (id) setSelectedId(id);
    };
    window.addEventListener("qm-support-focus", onFocus);
    return () => window.removeEventListener("qm-support-focus", onFocus);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("qm-support-viewing", {
        detail: { conversationId: selectedId },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("qm-support-viewing", {
          detail: { conversationId: null },
        }),
      );
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    sinceRef.current[selectedId] = "";
    setMessages([]);
    void loadThread(selectedId, true);
  }, [selectedId, loadThread]);

  useEffect(() => {
    let timer = 0;
    let stopped = false;
    async function tick() {
      if (stopped) return;
      try {
        await refreshList();
        const id = selectedRef.current;
        if (id) await loadThread(id, !sinceRef.current[id]);
      } catch {
        /* retry */
      }
      if (stopped) return;
      const ms =
        document.visibilityState !== "visible" ? 8000 : selectedRef.current ? 2500 : 8000;
      timer = window.setTimeout(tick, ms);
    }
    void tick();
    const kick = () => {
      window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", kick);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [filter, refreshList, loadThread]);

  async function onReply(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!selectedId || !text || sending) return;
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        conversationId: selectedId,
        senderId: null,
        senderRole: "support",
        body: text,
        createdAt: new Date().toISOString(),
        readAt: null,
        pending: true,
      },
    ]);
    setBody("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ op: "reply", conversationId: selectedId, body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setBody(text);
        const message = data.error || "Could not send";
        setError(message);
        pushToast({ kind: "error", title: message });
        return;
      }
      const saved = (data.messages ?? []) as UiMessage[];
      setMessages(saved);
      if (data.conversation) setMeta(data.conversation);
      const last = saved[saved.length - 1];
      if (last) sinceRef.current[selectedId] = last.createdAt;
      pushToast({ kind: "success", title: "Reply sent" });
      void refreshList();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setBody(text);
      setError("Network error");
      pushToast({ kind: "error", title: "Network error. Try again." });
    } finally {
      setSending(false);
    }
  }

  async function setStatus(op: "close" | "reopen") {
    if (!selectedId) return;
    const toastId = pushToast({
      kind: "loading",
      title: op === "close" ? "Closing conversation" : "Reopening conversation",
      message: "Working…",
    });
    try {
      const res = await fetch("/api/support/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ op, conversationId: selectedId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        updateToast(toastId, {
          kind: "error",
          title: data.error || "Could not update the chat",
          message: undefined,
        });
        return;
      }
      updateToast(toastId, {
        kind: "success",
        title: op === "close" ? "Conversation closed" : "Conversation reopened",
        message: undefined,
      });
      sinceRef.current[selectedId] = "";
      void loadThread(selectedId, true);
      void refreshList();
    } catch {
      updateToast(toastId, {
        kind: "error",
        title: "Network error. Try again.",
        message: undefined,
      });
    }
  }

  return (
    <div className="grid min-h-[32rem] gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="flex gap-1 border-b border-white/10 p-2">
          {(["all", "open", "pending", "closed"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] capitalize",
                filter === status ? "bg-white/15 text-white" : "text-white/45",
              )}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="max-h-[32rem] overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-white/40">No conversations.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "block w-full border-b border-white/5 px-3 py-3 text-left",
                  selectedId === item.id ? "bg-white/10" : "hover:bg-white/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {item.userName || item.guestName || "Guest"}
                  </span>
                  {(item.unreadCount ?? 0) > 0 && (
                    <span className="rounded-full bg-emerald-400 px-1.5 text-[10px] font-bold text-black">
                      {item.unreadCount}
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-white/40">
                  {item.lastPreview || item.status}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {!selectedId || !meta ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/40">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {meta.userName || meta.guestName || "Guest"}
                  <span className="ml-2 text-[11px] uppercase text-white/35">
                    {meta.status}
                  </span>
                </div>
                <div className="truncate text-[11px] text-white/40">
                  {meta.userEmail || meta.guestEmail || "No email"}
                  {meta.userId ? (
                    <>
                      {" · "}
                      <Link
                        href={`/admin/users/${meta.userId}`}
                        className="text-violet-300 hover:underline"
                      >
                        View profile
                      </Link>
                    </>
                  ) : (
                    <span> · guest</span>
                  )}
                </div>
              </div>
              {meta.status !== "closed" ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus("close")}>
                  Close
                </Button>
              ) : (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus("reopen")}>
                  Reopen
                </Button>
              )}
            </div>

            <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
              {messages.map((message) => {
                const staff =
                  message.senderRole === "support" || message.senderRole === "admin";
                return (
                  <div key={message.id} className={cn("flex", staff ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        staff
                          ? "rounded-br-md bg-gradient-to-br from-violet-500 to-pink-500"
                          : "rounded-bl-md border border-white/10 bg-white/8",
                        message.pending && "opacity-70",
                      )}
                    >
                      <div className="mb-0.5 text-[10px] uppercase text-white/50">
                        {message.senderRole}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{message.body}</div>
                      <div className="mt-1 text-[10px] text-white/40">
                        {message.pending ? "Sending…" : formatChatTime(message.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {meta.status !== "closed" && (
              <form onSubmit={onReply} data-qm-quiet className="space-y-2 border-t border-white/10 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {CANNED.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => setBody(reply)}
                      className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      {reply.slice(0, 32)}…
                    </button>
                  ))}
                </div>
                {error ? <p className="text-xs text-red-300">{error}</p> : null}
                <div className="flex items-end gap-2">
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={2}
                    maxLength={4000}
                    placeholder="Reply as support"
                    className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-violet-500/40"
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
