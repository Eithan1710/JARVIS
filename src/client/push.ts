"use client";
import { useCallback, useEffect, useState } from "react";
import { api, apiGet } from "./api";
import { toast } from "./store";

type PushState = "loading" | "unsupported" | "ios-needs-install" | "denied" | "prompt" | "subscribed" | "not-configured";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
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
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const sys = await apiGet<{ push: { configured: boolean; publicKey: string | null } }>("/api/system");
      if (!sys.push.configured || !sys.push.publicKey) {
        setState("not-configured");
        toast("התראות Push עוד לא הוגדרו בשרת (מפתחות VAPID).", { tone: "error" });
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "prompt");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(sys.push.publicKey) });
      const json = sub.toJSON();
      await api.post("/api/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      setState("subscribed");
      toast("התראות הופעלו במכשיר הזה", { tone: "success" });
    } catch {
      toast("לא הצלחנו להפעיל התראות במכשיר הזה", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.del("/api/push/subscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("prompt");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, subscribe, unsubscribe, refresh };
}
