"use client";
import { useState } from "react";
import type { ChatMessage, Chip, ClientAction, Step } from "@/lib/protocol";
import { Icon } from "./icons";
import { Markdown } from "./markdown";

const KIND_LABEL: Record<string, string> = { reminder: "תזכורת", habit: "הרגל", goal_checkin: "יעד" };

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function UserMessage({ m }: { m: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="user-text max-w-[82%] rounded-[20px] rounded-ee-md border border-line bg-veil px-4 py-2.5 text-pearl sm:max-w-[70%]">
        {m.inputMode === "voice" && <Icon name="mic" size={14} className="-mt-0.5 me-1.5 inline text-mist" />}
        {m.content}
      </div>
    </div>
  );
}

export function ActionButtons({ actions }: { actions: ClientAction[] }) {
  if (!actions.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a) => (
        <a
          key={a.url}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-veil px-4 py-2 text-[0.95rem] text-pearl transition-colors hover:border-[var(--line-strong)] hover:bg-veil-2"
        >
          <Icon name={a.icon} size={18} className="shrink-0 text-ion" />
          <span className="truncate">{a.label}</span>
          <Icon name="external" size={15} className="shrink-0 text-mist transition-transform group-hover:-translate-x-0.5" />
        </a>
      ))}
    </div>
  );
}

export function Chips({ chips }: { chips: Chip[] }) {
  if (!chips.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {chips.map((c, i) => (
        <span key={`${c.text}-${i}`} className="status-line inline-flex items-center gap-1.5 text-[0.88rem] text-mist">
          <Icon name={c.icon} size={15} className="text-ember" />
          {c.text}
        </span>
      ))}
    </div>
  );
}

export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-2 space-y-1 border-s border-line ps-3 text-[0.82rem] text-mist">
      {steps.map((s) => (
        <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className={s.state === "error" ? "text-danger" : "text-pearl-2"}>{s.label}</span>
          {s.detail && (
            <span dir="ltr" className="text-faint">
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
  const proactive = KIND_LABEL[m.kind];
  const steps = m.steps ?? [];
  return (
    <div className={`relative ${fresh ? "reveal" : ""}`}>
      {proactive && (
        <div className="mb-1.5 flex items-center gap-2 text-[0.8rem] text-mist">
          <span className="inline-block size-1.5 rounded-full bg-ember" />
          {proactive} · {formatTime(m.createdAt)}
        </div>
      )}
      <div className="jarvis-text">
        <Markdown text={m.content} />
      </div>
      <ActionButtons actions={m.actions ?? []} />
      <Chips chips={m.chips ?? []} />
      {steps.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md text-[0.8rem] text-faint transition-colors hover:text-mist"
            aria-expanded={open}
          >
            {open ? "הסתר פרטים" : "פרטים"}
            <Icon name="chevron" size={13} className={`transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
          </button>
          {open && <StepList steps={steps} />}
        </div>
      )}
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
  return <div className="py-2 text-center text-[0.78rem] text-faint">{label}</div>;
}
