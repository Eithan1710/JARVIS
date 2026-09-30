"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationSummary } from "@/lib/protocol";
import type { PushState } from "@/client/push";
import { Icon } from "./icons";

function relative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "אתמול";
  if (days < 7) return d.toLocaleDateString("he-IL", { weekday: "long" });
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

const PUSH_TEXT: Record<PushState, string> = {
  loading: "",
  unsupported: "הדפדפן הזה לא תומך בהתראות",
  "ios-needs-install": "כדי לקבל התראות באייפון: שתף ← הוסף למסך הבית",
  denied: "ההתראות חסומות בהגדרות הדפדפן",
  prompt: "הפעל התראות במכשיר הזה",
  subscribed: "התראות פעילות במכשיר הזה",
  "not-configured": "התראות עוד לא הוגדרו בשרת",
};

export function Drawer(p: {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[] | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onArchive: (id: string) => void;
  push: { state: PushState; busy: boolean; subscribe: () => void };
  onLock: () => void;
  lockable: boolean;
}) {
  const [q, setQ] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p.onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const all = p.conversations ?? [];
    const t = q.trim().toLowerCase();
    return t ? all.filter((c) => `${c.title ?? ""} ${c.preview ?? ""}`.toLowerCase().includes(t)) : all;
  }, [p.conversations, q]);

  return (
    <div className={`fixed inset-0 z-40 ${p.open ? "" : "pointer-events-none"}`} aria-hidden={!p.open}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${p.open ? "opacity-100" : "opacity-0"}`} onClick={p.onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label="שיחות"
        className={`drawer-panel absolute inset-y-0 start-0 flex w-[min(22rem,88vw)] flex-col border-e border-line outline-none transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${p.open ? "translate-x-0" : "translate-x-full"}`}
        style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-[1.05rem] font-medium text-pearl">שיחות</h2>
          <button type="button" onClick={p.onClose} className="grid size-10 place-items-center rounded-full text-mist hover:text-pearl" aria-label="סגור">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={p.onNew}
            className="flex w-full items-center gap-2 rounded-2xl border border-line bg-veil px-4 py-3 text-pearl transition-colors hover:bg-veil-2"
          >
            <Icon name="plus" size={18} className="text-ion" />
            שיחה חדשה
          </button>
          <label className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-mist ring-1 ring-line focus-within:ring-[var(--line-strong)]">
            <Icon name="search" size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בשיחות" className="w-full bg-transparent text-[0.95rem] text-pearl outline-none placeholder:text-faint" />
          </label>
        </div>
        <div className="scroll flex-1 overflow-y-auto px-2">
          {p.conversations === null ? (
            <p className="px-3 py-6 text-center text-[0.9rem] text-faint">טוען…</p>
          ) : list.length === 0 ? (
            <p className="px-3 py-6 text-center text-[0.9rem] text-faint">{q ? "לא נמצאו שיחות" : "עוד אין שיחות קודמות"}</p>
          ) : (
            <ul className="space-y-0.5">
              {list.map((c) => (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => p.onSelect(c.id)}
                    className={`w-full rounded-2xl px-3 py-2.5 text-start transition-colors hover:bg-veil ${c.id === p.activeId ? "bg-veil" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[0.95rem] text-pearl">{c.title ?? "שיחה"}</span>
                      <span className="shrink-0 text-[0.75rem] text-faint">{relative(c.lastMessageAt)}</span>
                    </div>
                    {c.preview && <div className="mt-0.5 truncate text-[0.83rem] text-mist">{c.preview.replace(/[*#`>]/g, "")}</div>}
                  </button>
                  <button
                    type="button"
                    onClick={() => p.onArchive(c.id)}
                    className="absolute end-2 top-2 hidden size-8 place-items-center rounded-full bg-veil-2 text-mist hover:text-pearl group-hover:grid"
                    aria-label="הסר מהרשימה"
                    title="הסר מהרשימה (נשאר בהיסטוריה)"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1 border-t border-line px-2 py-3">
          {p.push.state !== "loading" && (
            <button
              type="button"
              disabled={p.push.state !== "prompt" || p.push.busy}
              onClick={p.push.subscribe}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-[0.9rem] text-pearl-2 enabled:hover:bg-veil disabled:text-mist"
            >
              <Icon name={p.push.state === "subscribed" ? "bellOn" : "bell"} size={18} className={p.push.state === "subscribed" ? "text-ember" : ""} />
              {PUSH_TEXT[p.push.state]}
            </button>
          )}
          {p.lockable && (
            <button type="button" onClick={p.onLock} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-[0.9rem] text-pearl-2 hover:bg-veil">
              <Icon name="lock" size={18} />
              נעל
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
