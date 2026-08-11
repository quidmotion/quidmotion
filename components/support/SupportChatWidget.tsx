"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  markChatReadAction,
  pollChatAction,
  startOrSendChatAction,
} from "@/lib/actions/support-chat";
import type { ChatMessage } from "@/lib/support/types";

/** Open panel: near-realtime. Closed idle: light unread check. Hidden tab: rare. */
const POLL_OPEN_MS = 3000;
const POLL_CLOSED_MS = 20000;
const POLL_HIDDEN_MS = 60000;

export function SupportChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasConversation, setHasConversation] = useState(false);
  const [kind, setKind] = useState<"user" | "guest" | "staff" | "anon">("anon");
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onDashboardMobile, setOnDashboardMobile] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const onAdminSupport = pathname?.startsWith("/admin/support") ?? false;
  const onDashboard = pathname?.startsWith("/dashboard") ?? false;

  useEffect(() => {
    function check() {
      setOnDashboardMobile(onDashboard && window.matchMedia("(max-width: 767px)").matches);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [onDashboard]);

  useEffect(() => {
    function onVisibility() {
      setTabVisible(document.visibilityState === "visible");
    }
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await pollChatAction();
      if (data.hideWidget) {
        setHidden(true);
        return;
      }
      setHidden(false);
      setKind(data.kind);
      setMessages(data.messages ?? []);
      setHasConversation(!!data.conversation);
      setUnread(data.unread ?? 0);
      if (openRef.current) {
        await markChatReadAction();
        setUnread(0);
      }
    } catch {
      // ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    if (onAdminSupport) return;
    void poll();
    const intervalMs = !tabVisible
      ? POLL_HIDDEN_MS
      : open
        ? POLL_OPEN_MS
        : POLL_CLOSED_MS;
    const id = setInterval(() => void poll(), intervalMs);
    return () => clearInterval(id);
  }, [poll, onAdminSupport, open, tabVisible]);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  useEffect(() => {
    if (open) {
      void markChatReadAction().then(() => setUnread(0));
    }
  }, [open]);

  if (hidden || onAdminSupport) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const needGuest = kind === "anon" || (kind === "guest" && !hasConversation);
      const res = await startOrSendChatAction({
        body: text,
        guestName: needGuest ? guestName : undefined,
        guestEmail: needGuest ? guestEmail : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      if (res.messages) {
        setMessages(res.messages);
        setHasConversation(true);
        if (kind === "anon") setKind("guest");
      }
      scrollToBottom();
      void poll();
    } finally {
      setSending(false);
    }
  }

  const needsGuestFields =
    (kind === "anon" || kind === "guest") && !hasConversation;

  return (
    <div
      className={cn(
        "fixed z-[60] flex flex-col items-end gap-3",
        "right-3 sm:right-5",
        onDashboardMobile
          ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"
          : "bottom-[max(1.25rem,env(safe-area-inset-bottom))]",
      )}
    >
      {open && (
        <div
          className={cn(
            "flex w-[min(100vw-1.5rem,22.5rem)] flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0c0d12]/96 shadow-2xl shadow-violet-500/10 backdrop-blur-xl",
            onDashboardMobile ? "h-[min(62vh,28rem)]" : "h-[min(70vh,32rem)]",
          )}
          role="dialog"
          aria-label="Live support chat"
        >
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-violet-600/30 to-pink-600/20 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Live support</div>
              <div className="text-[11px] text-white/50">
                We typically reply soon
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={listRef}
            className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 && (
              <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/45">
                Hi! Send a message and our support team will get back to you.
              </p>
            )}
            {messages.map((m) => {
              const mine =
                m.senderRole === "user" || m.senderRole === "guest";
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    mine ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
                      mine
                        ? "rounded-br-md bg-gradient-to-br from-violet-500 to-pink-500 text-white"
                        : "rounded-bl-md border border-white/10 bg-white/8 text-white/90",
                    )}
                  >
                    {!mine && (
                      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-violet-200/80">
                        Support
                      </div>
                    )}
                    <div className="whitespace-pre-wrap break-words">
                      {m.body}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-[10px]",
                        mine ? "text-white/60" : "text-white/35",
                      )}
                    >
                      {m.createdAt.slice(11, 16)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={onSubmit}
            className="border-t border-white/10 bg-black/40 p-3 space-y-2"
          >
            {needsGuestFields && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white placeholder:text-white/35 outline-none focus:border-violet-500/40"
                />
                <input
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  type="email"
                  placeholder="Email"
                  required
                  className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white placeholder:text-white/35 outline-none focus:border-violet-500/40"
                />
              </div>
            )}
            {error && (
              <p className="text-xs text-red-300">{error}</p>
            )}
            <div className="flex gap-2">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type a message…"
                maxLength={4000}
                className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-violet-500/40"
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
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group relative flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-violet-500 to-pink-500 text-white",
          "shadow-lg shadow-violet-500/35 ring-1 ring-white/20",
          "transition hover:scale-105 hover:brightness-110 active:scale-95",
          "qm-chat-fab",
        )}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
