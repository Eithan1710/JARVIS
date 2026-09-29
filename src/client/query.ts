"use client";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { createStore, del, get, set } from "idb-keyval";

export const CACHE_VERSION = "nova-1";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: (count, err) => {
          const status = (err as { status?: number }).status;
          if (status && status >= 400 && status < 500) return false;
          return count < 2;
        },
        refetchOnWindowFocus: true,
        // Offline: serve cached data instead of erroring.
        networkMode: "offlineFirst",
      },
      mutations: { networkMode: "always" },
    },
  });
}

/** Recent read-only data is persisted on the device so the app opens instantly and offline. */
export function makePersister() {
  if (typeof indexedDB === "undefined") return undefined;
  const store = createStore("nova-cache", "queries");
  return createAsyncStoragePersister({
    storage: {
      getItem: (k) => get(k, store),
      setItem: (k, v) => set(k, v, store),
      removeItem: (k) => del(k, store),
    },
    throttleTime: 2000,
  });
}

export async function clearPersistedCache() {
  if (typeof indexedDB === "undefined") return;
  const store = createStore("nova-cache", "queries");
  const { clear } = await import("idb-keyval");
  await clear(store);
}
