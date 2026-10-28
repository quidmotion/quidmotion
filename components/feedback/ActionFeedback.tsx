"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Check, AlertTriangle, Bell } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { interpretActionBody } from "@/lib/ui/action-result";
import { unlockSound } from "@/lib/support/client";
import {
  dismissToast,
  getToasts,
  pushToast,
  subscribeToasts,
  updateToast,
  type ToastItem,
} from "./toast-bus";

type Job = { id: string; el: HTMLElement | null; timer: number };

const queue: Job[] = [];
let gestureAt = 0;
let progressDepth = 0;
let patched = false;

function labelOf(el: HTMLElement | null): string {
  const raw = (el?.innerText || el?.textContent || "Working")
    .replace(/\s+/g, " ")
    .trim();
  return raw.slice(0, 48) || "Working";
}

function setProgress(on: boolean) {
  const bar = document.getElementById("qm-progress");
  if (!bar) return;
  if (on) {
    progressDepth += 1;
    bar.dataset.on = "1";
    return;
  }
  progressDepth = Math.max(0, progressDepth - 1);
  if (progressDepth > 0) return;
  bar.dataset.on = "2";
  window.setTimeout(() => {
    if (progressDepth === 0 && bar.dataset.on === "2") bar.dataset.on = "0";
  }, 380);
}

function beginJob(label: string, el: HTMLElement | null) {
  setProgress(true);
  if (el) el.classList.add("qm-busy");
  const id = pushToast({
    kind: "loading",
    title: label,
    message: "Working…",
  });
  const timer = window.setTimeout(() => {
    const index = queue.findIndex((job) => job.id === id);
    if (index === -1) return;
    const [job] = queue.splice(index, 1);
    job.el?.classList.remove("qm-busy");
    updateToast(id, {
      kind: "error",
      title: "This is taking too long",
      message: "Check the page and try again.",
    });
    setProgress(false);
  }, 20000);
  queue.push({ id, el, timer });
}

function finishJob(outcome: { ok: boolean; title: string }) {
  const job = queue.shift();
  if (!job) {
    pushToast({
      kind: outcome.ok ? "success" : "error",
      title: outcome.title,
    });
    return;
  }
  window.clearTimeout(job.timer);
  job.el?.classList.remove("qm-busy");
  updateToast(job.id, {
    kind: outcome.ok ? "success" : "error",
    title: outcome.title,
    message: undefined,
  });
  setProgress(false);
}

function headerHas(headers: HeadersInit | undefined, name: string) {
  if (!headers) return false;
  return new Headers(headers).has(name);
}

function isNextAction(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof Request !== "undefined" && input instanceof Request) {
    if (input.headers.has("Next-Action") || input.headers.has("next-action")) {
      return true;
    }
  }
  return (
    headerHas(init?.headers, "Next-Action") ||
    headerHas(init?.headers, "next-action")
  );
}

function isPrefetch(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof Request !== "undefined" && input instanceof Request) {
    if (input.headers.get("Next-Router-Prefetch") === "1") return true;
  }
  return new Headers(init?.headers).get("Next-Router-Prefetch") === "1";
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isInternalLink(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  try {
    const url = new URL(anchor.href, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function installFeedback() {
  if (patched) return;
  patched = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const track =
      isNextAction(input, init) &&
      !isPrefetch(input, init) &&
      !requestUrl(input).includes("/api/support/");
    const recent = Date.now() - gestureAt < 2500;
    const owned = track && queue.length === 0 && recent;
    if (track && queue.length === 0 && !recent) {
      return original(input, init);
    }
    if (owned) beginJob("Working…", null);
    try {
      const response = await original(input, init);
      if (track && (owned || queue.length > 0)) {
        const text = await response.clone().text().catch(() => "");
        finishJob(
          interpretActionBody(
            text,
            response.status,
            response.headers.get("x-action-redirect"),
          ),
        );
      }
      return response;
    } catch (error) {
      if (track && (owned || queue.length > 0)) {
        finishJob({ ok: false, title: "Network error. Try again." });
      }
      throw error;
    }
  };

  document.addEventListener(
    "pointerdown",
    (event) => {
      gestureAt = Date.now();
      unlockSound();
      const target = event.target as HTMLElement | null;
      const el = target?.closest(
        "button, a, [role='button'], input[type='submit'], input[type='button'], summary",
      );
      if (!(el instanceof HTMLElement)) return;
      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
        return;
      }
      const dot = document.createElement("span");
      dot.className = "qm-ripple";
      dot.style.left = `${event.clientX}px`;
      dot.style.top = `${event.clientY}px`;
      document.body.appendChild(dot);
      window.setTimeout(() => dot.remove(), 450);
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.hasAttribute("data-qm-quiet")) return;
      const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
      beginJob(labelOf(submitter), submitter);
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!(anchor instanceof HTMLAnchorElement) || !isInternalLink(anchor)) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      setProgress(true);
      const label = labelOf(anchor);
      let navToastId: string | null = null;
      const timer = window.setTimeout(() => {
        navToastId = pushToast({ kind: "loading", title: "Opening", message: label });
      }, 450);
      const stop = () => {
        window.clearTimeout(timer);
        if (navToastId) dismissToast(navToastId);
        window.removeEventListener("qm-nav-settled", stop);
      };
      window.addEventListener("qm-nav-settled", stop);
    },
    true,
  );
}

export function ActionFeedback() {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    installFeedback();
    const unsubscribe = subscribeToasts(() => setToasts(getToasts()));
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new Event("qm-nav-settled"));
    const bar = document.getElementById("qm-progress");
    if (!bar || bar.dataset.on === "0" || !bar.dataset.on) return;
    progressDepth = 0;
    bar.dataset.on = "2";
    const timer = window.setTimeout(() => {
      if (bar.dataset.on === "2") bar.dataset.on = "0";
    }, 380);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <>
      <div id="qm-progress" data-on="0" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-3">
        <div className="flex w-full max-w-sm flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-2 rounded-2xl border px-3 py-2.5 shadow-lg shadow-black/40 backdrop-blur-xl",
                toast.kind === "error"
                  ? "border-red-400/30 bg-red-950/90 text-red-100"
                  : toast.kind === "success"
                    ? "border-emerald-400/30 bg-[#10241a]/95 text-emerald-50"
                    : toast.kind === "info"
                      ? "border-violet-400/30 bg-[#16141f]/95 text-white"
                      : "border-white/15 bg-[#14151c]/95 text-white",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {toast.kind === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : toast.kind === "success" ? (
                  <Check className="h-4 w-4 text-emerald-300" />
                ) : toast.kind === "error" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4 text-violet-300" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug">{toast.title}</div>
                {toast.message ? (
                  <div className="mt-0.5 text-xs leading-snug text-white/60">
                    {toast.message}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-md px-1 text-xs text-white/45 hover:text-white"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
