"use client";
/**
 * Offline outbox. Mutations that fail because the device is offline are stored in IndexedDB
 * and replayed in order when connectivity returns. The UI shows the state explicitly:
 * "נשמר במכשיר" → "סונכרן".
 *
 * Server endpoints used through the outbox are idempotent (upserts keyed by date/client id),
 * so a replay after an ambiguous failure is safe.
 */
import { createStore as idbStore, del, entries, set } from "idb-keyval";
import { createStore } from "./store";

export interface OutboxItem {
  id: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  label: string;
  createdAt: number;
  attempts: number;
}

export const sync = createStore<{ pending: number; syncing: boolean; lastSyncedAt: number | null; lastError: string | null }>({
  pending: 0,
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
});

const store = typeof indexedDB !== "undefined" ? idbStore("nova-outbox", "items") : undefined;

async function all(): Promise<OutboxItem[]> {
  if (!store) return [];
  const list = await entries<string, OutboxItem>(store);
  return list.map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt);
}

export async function refreshCount() {
  sync.set({ pending: (await all()).length });
}

export async function enqueue(item: Omit<OutboxItem, "id" | "createdAt" | "attempts">) {
  if (!store) throw new Error("offline storage unavailable");
  const full: OutboxItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0 };
  await set(full.id, full, store);
  await refreshCount();
  return full;
}

let flushing: Promise<number> | null = null;
let onSynced: (() => void) | null = null;

export function setOnSynced(fn: () => void) {
  onSynced = fn;
}

/** Replay queued mutations in order. Stops at the first network failure. */
export function flush(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!store || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
    const items = await all();
    if (!items.length) return 0;
    sync.set({ syncing: true, lastError: null });
    let done = 0;
    for (const it of items) {
      try {
        const res = await fetch(it.path, {
          method: it.method,
          headers: it.body !== undefined ? { "content-type": "application/json" } : undefined,
          body: it.body !== undefined ? JSON.stringify(it.body) : undefined,
          credentials: "same-origin",
        });
        if (res.status === 401) {
          sync.set({ lastError: "נדרשת כניסה מחדש כדי לסנכרן" });
          break;
        }
        // 4xx other than 401/408/429 will never succeed — drop it rather than block the queue.
        if (res.ok || (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status))) {
          await del(it.id, store);
          done++;
          if (!res.ok) sync.set({ lastError: `פעולה אחת לא נשמרה: ${it.label}` });
        } else {
          await set(it.id, { ...it, attempts: it.attempts + 1 }, store);
          break;
        }
      } catch {
        await set(it.id, { ...it, attempts: it.attempts + 1 }, store);
        break;
      }
    }
    await refreshCount();
    sync.set({ syncing: false, ...(done ? { lastSyncedAt: Date.now() } : {}) });
    if (done) onSynced?.();
    return done;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export function startOutbox() {
  void refreshCount().then(() => flush());
  const kick = () => void flush();
  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
  });
  const t = window.setInterval(kick, 30_000);
  return () => {
    window.removeEventListener("online", kick);
    window.clearInterval(t);
  };
}
