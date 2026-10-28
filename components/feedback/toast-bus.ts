export type ToastKind = "loading" | "success" | "error" | "info";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

const items = new Map<string, ToastItem>();
const listeners = new Set<() => void>();
const timers = new Map<string, number>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getToasts(): ToastItem[] {
  return [...items.values()].slice(-4);
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function scheduleDismiss(id: string, kind: ToastKind) {
  const prev = timers.get(id);
  if (prev) window.clearTimeout(prev);
  if (kind === "loading") return;
  const ms = kind === "error" ? 5600 : kind === "info" ? 6400 : 3400;
  timers.set(
    id,
    window.setTimeout(() => dismissToast(id), ms),
  );
}

export function pushToast(input: Omit<ToastItem, "id"> & { id?: string }): string {
  const id = input.id ?? Math.random().toString(36).slice(2, 10);
  const toast: ToastItem = { ...input, id };
  items.set(id, toast);
  if (typeof window !== "undefined") scheduleDismiss(id, toast.kind);
  emit();
  return id;
}

export function updateToast(
  id: string,
  patch: Partial<Omit<ToastItem, "id">>,
) {
  const current = items.get(id);
  if (!current) return;
  const next = { ...current, ...patch };
  items.set(id, next);
  if (typeof window !== "undefined") scheduleDismiss(id, next.kind);
  emit();
}

export function dismissToast(id: string) {
  const timer = timers.get(id);
  if (timer) window.clearTimeout(timer);
  timers.delete(id);
  if (!items.delete(id)) return;
  emit();
}
