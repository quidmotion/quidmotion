"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Loader2, Bell } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ChatMessage } from "@/lib/support/types";
import {
  formatChatTime,
  playChime,
  requestMessageAlerts,
  showOsNotification,
} from "@/lib/support/client";
import { pushToast } from "@/components/feedback/toast-bus";

type UiMessage = ChatMessage & { pending?: boolean };

const STARTERS = [
  { label: "Deposit", text: "I have a question about a deposit." },
  { label: "Withdrawal", text: "I need help with a withdrawal." },
  { label: "KYC", text: "I have a question about KYC verification." },
];

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

export function SupportChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [staffUnread, setStaffUnread] = useState(0);
  const [hasConversation, setHasConversation] = useState(false);
  const [kind, setKind] = useState<"user" | "guest" | "staff" | "anon">("anon");
  const [convStatus, setConvStatus] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onDashboardMobile, setOnDashboardMobile] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission | "unknown">(
    "unknown",
  );
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const sinceRef = useRef<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const staffRef = useRef(false);
  const primedRef = useRef(false);
  const seenRef = useRef(new Set<string>());
  const viewingRef = useRef<string | null>(null);
  openRef.current = open;

  const onAdminSupport =
    pathname === "/admin/support" || pathname.startsWith("/admin/support/");
  const needsGuestFields =
    (kind === "anon" || kind === "guest") && !hasConversation;

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifyPerm(Notification.permission);
  }, [open, kind]);

  useEffect(() => {
    const onResize = () => {
      setOnDashboardMobile(
        window.innerWidth < 768 && pathname.startsWith("/dashboard"),
      );
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pathname]);

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const count = kind === "staff" ? staffUnread : unread;
    const base = document.title.replace(/^\(\d+\+?\)\s/, "");
    if (!tabVisible && count > 0) {
      document.title = `(${count > 9 ? "9+" : count}) ${base}`;
    } else if (document.title !== base) {
      document.title = base;
    }
  }, [unread, staffUnread, tabVisible, kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    let timer = 0;
    let stopped = false;

    async function pollVisitor() {
      const since = sinceRef.current;
      const looking = openRef.current && document.visibilityState === "visible";
      const res = await fetch("/api/support/visitor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ op: "poll", since, markRead: looking }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.kind === "staff") {
        staffRef.current = true;
        setKind("staff");
        setHidden(true);
        return;
      }
      setHidden(false);
      setKind(data.kind);
      const conv = data.conversation as { id: string; status: string } | null;
      const nextId = conv?.id ?? null;
      const idChanged = nextId !== convIdRef.current;
      if (idChanged && since && nextId) {
        convIdRef.current = nextId;
        sinceRef.current = null;
        return;
      }
      convIdRef.current = nextId;
      setHasConversation(!!conv);
      setConvStatus(conv?.status ?? null);
      const incoming = (data.messages ?? []) as UiMessage[];
      setMessages((prev) => mergeMessages(prev, incoming, idChanged || !since));
      const last = incoming[incoming.length - 1];
      if (last && (!sinceRef.current || last.createdAt > sinceRef.current)) {
        sinceRef.current = last.createdAt;
      }
      setUnread(typeof data.unread === "number" ? data.unread : 0);

      const fresh: UiMessage[] = [];
      for (const message of incoming) {
        if (message.senderRole !== "support" && message.senderRole !== "admin") {
          seenRef.current.add(message.id);
          continue;
        }
        if (seenRef.current.has(message.id)) continue;
        if (primedRef.current) fresh.push(message);
        seenRef.current.add(message.id);
      }
      primedRef.current = true;
      if (!fresh.length || looking) return;
      const latest = fresh[fresh.length - 1];
      pushToast({
        kind: "info",
        title: "New support message",
        message: latest.body.slice(0, 140),
      });
      playChime();
      showOsNotification(
        "QuidMotion support",
        latest.body.slice(0, 140),
        "qm-support-user",
        () => window.dispatchEvent(new Event("qm-support-open")),
      );
    }

    async function pollStaff() {
      const res = await fetch("/api/support/staff?op=alerts", {
        credentials: "same-origin",
      });
      if (res.status === 401) return;
      if (!res.ok) return;
      const data = await res.json();
      if (!data.access) {
        staffRef.current = false;
        setHidden(false);
        return;
      }
      setStaffUnread(data.unread ?? 0);
      const items = (data.items ?? []) as {
        id: string;
        conversationId: string;
        body: string;
        fromName: string;
      }[];
      const fresh = [];
      for (const item of items) {
        if (seenRef.current.has(item.id)) continue;
        if (primedRef.current) fresh.push(item);
        seenRef.current.add(item.id);
      }
      primedRef.current = true;
      const visible = document.visibilityState === "visible";
      const notify = fresh.filter(
        (item) => !(visible && viewingRef.current === item.conversationId),
      );
      if (!notify.length) return;
      const latest = notify[0];
      pushToast({
        kind: "info",
        title: `New message from ${latest.fromName}`,
        message: latest.body,
      });
      playChime();
      showOsNotification(
        `Message from ${latest.fromName}`,
        latest.body,
        `qm-staff-${latest.conversationId}`,
        () => {
          window.dispatchEvent(
            new CustomEvent("qm-support-focus", {
              detail: { conversationId: latest.conversationId },
            }),
          );
          if (!window.location.pathname.startsWith("/admin/support")) {
            window.location.assign(`/admin/support?c=${latest.conversationId}`);
          }
        },
      );
    }

    async function tick() {
      if (stopped) return;
      try {
        if (staffRef.current) await pollStaff();
        else await pollVisitor();
      } catch {
        /* next tick retries */
      }
      if (stopped) return;
      const staff = staffRef.current;
      const panelOpen = openRef.current;
      const hasConv = !!convIdRef.current;
      if (!staff && !panelOpen && !hasConv) return;
      const hiddenTab = document.visibilityState !== "visible";
      const ms = !hiddenTab && panelOpen && !staff ? 2500 : 8000;
      timer = window.setTimeout(tick, ms);
    }

    const kick = () => {
      window.clearTimeout(timer);
      void tick();
    };
    const onView = (event: Event) => {
      viewingRef.current =
        (event as CustomEvent<{ conversationId?: string | null }>).detail
          ?.conversationId ?? null;
    };
    const onOpen = () => setOpen(true);
    kick();
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("qm-support-kick", kick);
    window.addEventListener("qm-support-open", onOpen);
    window.addEventListener("qm-support-viewing", onView);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", kick);
      window.removeEventListener("qm-support-kick", kick);
      window.removeEventListener("qm-support-open", onOpen);
      window.removeEventListener("qm-support-viewing", onView);
    };
  }, []);

  useEffect(() => {
    if (open) window.dispatchEvent(new Event("qm-support-kick"));
  }, [open]);

  async function enableAlerts() {
    const perm = await requestMessageAlerts();
    if (perm !== "unsupported") setNotifyPerm(perm);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    if (needsGuestFields && (!guestName.trim() || !guestEmail.trim())) {
      setError("Name and email are required");
      return;
    }
    if (notifyPerm === "default") void enableAlerts();

    const tempId = `tmp-${Date.now()}`;
    const optimistic: UiMessage = {
      id: tempId,
      conversationId: convIdRef.current ?? "",
      senderId: null,
      senderRole: kind === "user" ? "user" : "guest",
      body: text,
      createdAt: new Date().toISOString(),
      readAt: null,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setBody("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/visitor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          op: "send",
          body: text,
          guestName: needsGuestFields ? guestName : undefined,
          guestEmail: needsGuestFields ? guestEmail : undefined,
        }),
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
      setHasConversation(true);
      convIdRef.current = data.conversationId ?? convIdRef.current;
      const last = saved[saved.length - 1];
      if (last) sinceRef.current = last.createdAt;
      if (kind === "anon") setKind("guest");
      setConvStatus("open");
      pushToast({ kind: "success", title: "Message sent" });
      window.dispatchEvent(new Event("qm-support-kick"));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setBody(text);
      setError("Network error");
      pushToast({ kind: "error", title: "Network error. Try again." });
    } finally {
      setSending(false);
    }
  }

  const alertButton =
    notifyPerm === "default" ? (
      <button
        type="button"
        onClick={() => void enableAlerts()}
        className="fixed bottom-5 left-4 z-[60] flex items-center gap-2 rounded-full border border-violet-400/30 bg-[#16141f]/95 px-3 py-2 text-xs text-violet-100 shadow-lg"
      >
        <Bell className="h-3.5 w-3.5" />
        Enable message alerts
      </button>
    ) : null;

  if (hidden || onAdminSupport) {
    return kind === "staff" ? alertButton : null;
  }

  return (
    <div
      className={cn(
        "fixed z-[60] flex flex-col items-end gap-3",
        onDashboardMobile ? "bottom-20 right-3" : "bottom-4 right-4 sm:bottom-5 sm:right-5",
      )}
    >
      {kind === "staff" ? alertButton : null}
      {open && (
        <div
          role="dialog"
          aria-label="Live support chat"
          className="flex h-[min(32rem,calc(100vh-8rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12131a]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Support</div>
              <div className="text-[11px] text-white/45">
                We typically reply within a few minutes.
              </div>
              {notifyPerm === "default" ? (
                <button
                  type="button"
                  className="mt-1 text-[11px] text-violet-300 underline"
                  onClick={() => void enableAlerts()}
                >
                  Turn on alerts
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="px-1 text-xs leading-relaxed text-white/45">
                Ask about a deposit, withdrawal, or verification. A person on the
                support team will reply here.
              </p>
            ) : null}
            {messages.map((message) => {
              const mine =
                message.senderRole === "user" || message.senderRole === "guest";
              return (
                <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      mine
                        ? "rounded-br-md bg-gradient-to-br from-violet-500 to-pink-500 text-white"
                        : "rounded-bl-md border border-white/10 bg-white/8",
                      message.pending && "opacity-70",
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{message.body}</div>
                    <div className="mt-1 text-[10px] text-white/55">
                      {message.pending ? "Sending…" : formatChatTime(message.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {convStatus === "closed" ? (
            <p className="px-4 pb-1 text-[11px] text-white/45">
              This chat is closed. Send a message to start a new one.
            </p>
          ) : null}

          <form onSubmit={onSubmit} data-qm-quiet className="border-t border-white/10 p-3">
            {needsGuestFields ? (
              <div className="mb-2 grid grid-cols-2 gap-2">
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Name"
                  className="h-9 rounded-xl border border-white/10 bg-white/5 px-2 text-xs outline-none focus:border-violet-400/50"
                />
                <input
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  placeholder="Email"
                  type="email"
                  className="h-9 rounded-xl border border-white/10 bg-white/5 px-2 text-xs outline-none focus:border-violet-400/50"
                />
              </div>
            ) : null}
            {messages.length === 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => setBody(starter.text)}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/10"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>
            ) : null}
            {error ? <p className="mb-2 text-xs text-red-300">{error}</p> : null}
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
                placeholder="Write a message"
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-violet-400/50"
              />
              <button
                type="submit"
                disabled={sending || !body.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white disabled:opacity-40"
                aria-label="Send"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-violet-500 to-pink-500 text-white",
          "shadow-lg shadow-violet-500/35 ring-1 ring-white/20",
          "transition hover:brightness-110",
          "qm-chat-fab",
        )}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
