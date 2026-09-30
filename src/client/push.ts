"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "./api";

export type PushState = "loading" | "unsupported" | "ios-needs-install" | "denied" | "prompt" | "subscribed" | "not-configured";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState(ios && !standalone ? "ios-needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setState(sub ? "subscribed" : "prompt");
  }, []);

  useEffect(() => {
    void refresh().catch(() => setState("unsupported"));
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const sys = await apiGet<{ push: { configured: boolean; publicKey: string | null } }>("/api/system");
      if (!sys.push.configured || !sys.push.publicKey) {
        setState("not-configured");
        return "התראות עוד לא הוגדרו בשרת (מפתחות VAPID).";
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "prompt");
        return perm === "denied" ? "ההתראות חסומות. אפשר לאפשר אותן בהגדרות הדפדפן." : null;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(sys.push.publicKey) });
      const json = sub.toJSON();
      await apiSend("POST", "/api/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      setState("subscribed");
      return "התראות הופעלו במכשיר הזה.";
    } catch {
      return "לא הצלחתי להפעיל התראות במכשיר הזה.";
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, subscribe, refresh };
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (location.hostname === "localhost" && process.env.NODE_ENV !== "production") return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}
