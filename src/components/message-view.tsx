"use client";
import { useState } from "react";
import type { ChatMessage, Chip, ClientAction, IconName, Step } from "@/lib/protocol";
import { Core } from "./core";
import { Icon } from "./icons";
import { Markdown } from "./markdown";

const KIND: Record<string, { label: string; icon: IconName; tint: string }> = {
  reminder: { label: "תזכורת", icon: "bell", tint: "var(--solar)" },
  habit: { label: "הרגל", icon: "repeat", tint: "var(--mint)" },
  goal_checkin: { label: "יעד", icon: "target", tint: "var(--plasma)" },
};

/** Each kind of action gets its own colour, so a card reads at a glance. */
const TILE: Partial<Record<IconName, { bg: string; glow: string; hint: string }>> = {
  youtube: { bg: "linear-gradient(135deg,#ff4b4b,#c4002b)", glow: "rgb(255 60 60 / 0.6)", hint: "נפתח ב־YouTube" },
  music: { bg: "linear-gradient(135deg,#3be37f,#0d9e4d)", glow: "rgb(60 230 130 / 0.55)", hint: "נפתח ב־Spotify" },
  map: { bg: "linear-gradient(135deg,#46e2ff,#1c7bff)", glow: "rgb(60 170 255 / 0.6)", hint: "ניווט" },
  github: { bg: "linear-gradient(135deg,#ffffff,#a9b1c7)", glow: "rgb(255 255 255 / 0.35)", hint: "נפתח ב־GitHub" },
  calendar: { bg: "linear-gradient(135deg,#ffb35c,#ff6a3d)", glow: "rgb(255 140 70 / 0.55)", hint: "שמירה ביומן" },
  link: { bg: "linear-gradient(135deg,#a78bff,#6247ff)", glow: "rgb(130 100 255 / 0.6)", hint: "פתיחת קישור" },
};

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function UserMessage({ m }: { m: ChatMessage }) {
  return (
    <div className="rise flex justify-end">
      <div className="user-bubble max-w-[84%] rounded-[22px] rounded-ee-[8px] px-4 py-2.5 text-[1.0625rem] leading-relaxed text-ink sm:max-w-[72%]">
        {m.inputMode === "voice" && <Icon name="mic" size={15} className="-mt-0.5 me-1.5 inline text-arc" />}
        {m.content}
      </div>
    </div>
  );
}

export function ActionCards({ actions }: { actions: ClientAction[] }) {
  if (!actions.length) return null;
  return (
    <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
      {actions.map((a) => {
        const t = TILE[a.icon] ?? TILE.link!;
        let host = "";
        try {
          host = new URL(a.url).hostname.replace(/^www\./, "");
        } catch {
          /* ignore */
        }
        return (
          <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="action-card rise group flex items-center gap-3.5 rounded-[20px] p-3 pe-4">
            <span className="tile grid size-12 shrink-0 place-items-center rounded-[14px] text-white" style={{ background: t.bg, "--tile-glow": t.glow } as React.CSSProperties}>
              <Icon name={a.icon} size={24} strokeWidth={1.8} className={a.icon === "github" ? "text-[#0a0c1c]" : ""} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.98rem] font-medium text-ink">{a.label}</span>
              <span className="block truncate text-[0.8rem] text-ink-3">
                {t.hint} · <span dir="ltr">{host}</span>
              </span>
            </span>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-glass-2 text-ink-2 transition-transform group-hover:-translate-x-0.5">
              <Icon name="arrow" size={16} />
            </span>
          </a>
        );
      })}
    </div>
  );
}

export function Chips({ chips }: { chips: Chip[] }) {
  if (!chips.length) return null;
  return (
    <div className="mt-3.5 flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <span key={`${c.text}-${i}`} className="chip-done rise inline-flex max-w-full items-center gap-2 rounded-full py-1.5 ps-1.5 pe-3.5 text-[0.86rem]">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-mint/20 text-mint">
            <Icon name={c.icon} size={14} strokeWidth={2} />
          </span>
          <span className="truncate">{c.text}</span>
        </span>
      ))}
    </div>
  );
}

export function StepList({ steps, live }: { steps: Step[]; live?: boolean }) {
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((s) => (
        <li key={s.id} className="rise flex items-center gap-2.5 text-[0.86rem]">
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full ${
              s.state === "running" ? "border border-arc/60" : s.state === "error" ? "bg-danger/20 text-danger" : "bg-mint/15 text-mint"
            }`}
          >
            {s.state === "running" ? <span className="size-1.5 animate-ping rounded-full bg-arc" /> : <Icon name={s.state === "error" ? "x" : "check"} size={12} strokeWidth={2.4} />}
          </span>
          <span className={s.state === "running" ? "shimmer" : s.state === "error" ? "text-danger" : "text-ink-2"}>{s.label}</span>
          {!live && s.detail && (
            <span dir="ltr" className="text-[0.75rem] text-ink-3">
              {s.detail}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function JarvisMessage({ m, fresh }: { m: ChatMessage; fresh?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const kind = KIND[m.kind];
  const steps = m.steps ?? [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (kind) {
    return (
      <div className={`glass rounded-[22px] p-4 ${fresh ? "reveal" : ""}`} style={{ boxShadow: `inset 3px 0 0 ${kind.tint}` }}>
        <div className="mb-2 flex items-center gap-2 text-[0.8rem] text-ink-3">
          <span className="grid size-6 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${kind.tint} 22%, transparent)`, color: kind.tint }}>
            <Icon name={kind.icon} size={14} strokeWidth={2} />
          </span>
          {kind.label} · {formatTime(m.createdAt)}
        </div>
        <div className="jarvis-text">
          <Markdown text={m.content} />
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex gap-3 ${fresh ? "reveal" : ""}`}>
      <Core size={22} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="jarvis-text">
          <Markdown text={m.content} />
        </div>
        <ActionCards actions={m.actions ?? []} />
        <Chips chips={m.chips ?? []} />
        <div className="mt-2.5 flex items-center gap-1 text-ink-3">
          <button type="button" onClick={copy} className="grid size-8 place-items-center rounded-full transition-colors hover:bg-glass-2 hover:text-ink" aria-label="העתק">
            <Icon name={copied ? "check" : "copy"} size={15} />
          </button>
          {steps.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[0.8rem] transition-colors hover:bg-glass-2 hover:text-ink"
              aria-expanded={open}
            >
              {open ? "הסתר מה עשיתי" : `מה עשיתי · ${steps.length}`}
              <Icon name="chevron" size={13} className={`transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
            </button>
          )}
        </div>
        {open && <StepList steps={steps} />}
      </div>
    </div>
  );
}

export function DaySeparator({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const label = same(d, today) ? "היום" : same(d, y) ? "אתמול" : d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="flex items-center gap-3 py-1 text-[0.75rem] text-ink-3">
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line-2" />
      {label}
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line-2" />
    </div>
  );
}
