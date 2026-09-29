"use client";
/**
 * Tiny external store (no dependencies) for app-wide UI state: which sheet is open, toasts,
 * sync status. Components subscribe with useStore(selector).
 */
import { useSyncExternalStore } from "react";

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useStore<T extends object, S>(store: ReturnType<typeof createStore<T>>, selector: (s: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

/* ------------------------------ UI store ------------------------------ */

export type SheetName =
  | null
  | "quick-add"
  | "checkin"
  | "notifications"
  | { kind: "metric"; metricKey?: string }
  | { kind: "transaction" }
  | { kind: "journal" }
  | { kind: "habit-form"; habitId?: string }
  | { kind: "goal-form"; goalId?: string }
  | { kind: "habit-log"; habitId: string; date: string }
  | { kind: "experiment-form" }
  | { kind: "conversations" };

export interface Toast {
  id: number;
  text: string;
  tone?: "default" | "success" | "error" | "offline";
  action?: { label: string; onClick: () => void };
}

export const ui = createStore<{ sheet: SheetName; toasts: Toast[] }>({ sheet: null, toasts: [] });

export function openSheet(s: SheetName) {
  ui.set({ sheet: s });
}
export function closeSheet() {
  ui.set({ sheet: null });
}

let toastId = 0;
export function toast(text: string, opts: Omit<Toast, "id" | "text"> & { duration?: number } = {}) {
  const id = ++toastId;
  ui.set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone: opts.tone, action: opts.action }] }));
  setTimeout(() => ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), opts.duration ?? 3200);
  return id;
}
export function dismissToast(id: number) {
  ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
