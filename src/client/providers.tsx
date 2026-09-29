"use client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CACHE_VERSION, makePersister, makeQueryClient } from "./query";
import { flush, setOnSynced, startOutbox, sync } from "./outbox";
import { useKeyboardInsetEffect } from "./hooks";
import { toast } from "./store";
import { Toaster } from "@/components/ui/toaster";

function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        const promptUpdate = (worker: ServiceWorker) =>
          toast("גרסה חדשה של NOVA זמינה", {
            duration: 60_000,
            action: { label: "רענן", onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
          });
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) promptUpdate(w);
          });
        });
        // Check for updates when the app comes back to the foreground.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch(() => {});
    // The SW relays notification clicks so we can record them.
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "NAVIGATE" && typeof e.data.url === "string") location.href = e.data.url;
    });
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeQueryClient);
  const [persister] = useState(makePersister);
  useKeyboardInsetEffect();
  useServiceWorker();

  useEffect(() => {
    setOnSynced(() => {
      void client.invalidateQueries();
      toast("סונכרן ✓", { tone: "success", duration: 2000 });
    });
    const stop = startOutbox();
    const onOnline = () => {
      void flush();
      void client.invalidateQueries();
    };
    const onOffline = () => {
      if (sync.get().pending === 0) toast("אין חיבור לאינטרנט — אפשר להמשיך לעבוד, הכול יישמר במכשיר", { tone: "offline", duration: 4000 });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      stop();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [client]);

  const content = (
    <>
      {children}
      <Toaster />
    </>
  );
  if (!persister) return <QueryClientProvider client={client}>{content}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        buster: CACHE_VERSION,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && !String(q.queryKey[0]).startsWith("conversation") },
      }}
    >
      {content}
    </PersistQueryClientProvider>
  );
}
