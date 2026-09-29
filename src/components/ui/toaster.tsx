"use client";
import { CheckCircle2, CloudOff, X } from "lucide-react";
import { dismissToast, ui, useStore } from "@/client/store";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useStore(ui, (s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-bottom)+12px+var(--kb))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pe-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex max-w-[min(92vw,440px)] animate-pop items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-float",
            t.tone === "error" ? "bg-negative text-white" : "bg-ink text-bg",
          )}
        >
          {t.tone === "success" ? <CheckCircle2 className="size-4 shrink-0" /> : t.tone === "offline" ? <CloudOff className="size-4 shrink-0" /> : null}
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action ? (
            <button
              className="shrink-0 rounded-lg px-2 py-1 font-semibold underline-offset-2 hover:underline"
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : (
            <button className="shrink-0 opacity-60 hover:opacity-100" onClick={() => dismissToast(t.id)} aria-label="סגירה">
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
