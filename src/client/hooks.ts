"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** md breakpoint and up = tablet/desktop composition. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
export const useIsMobile = () => !useMediaQuery("(min-width: 768px)");

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function useStandalone(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setV(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
  }, []);
  return v;
}

/**
 * iOS Safari keeps fixed elements behind the on-screen keyboard. We track the keyboard height
 * via visualViewport and expose it as --kb so sticky composers/sheets can sit above it.
 */
export function useKeyboardInsetEffect() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb", `${kb > 60 ? kb : 0}px`);
      root.dataset.keyboard = kb > 60 ? "open" : "closed";
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
}

export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-keyboard"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.dataset.keyboard === "open",
    () => false,
  );
}

export function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
