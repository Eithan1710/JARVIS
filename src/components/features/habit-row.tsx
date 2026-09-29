"use client";
import { Check, Minus, X, CircleSlash, Flame } from "lucide-react";
import { useLogHabit } from "@/client/mutations";
import { openSheet } from "@/client/store";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface HabitLite {
  id: string;
  name: string;
  tier: "main" | "side";
  kind: "boolean" | "quantity";
  unit: string | null;
  targetValue: number | null;
  frequency: "daily" | "specific_days" | "weekly_count";
  timeLabel: string | null;
  today: { date: string; status: string | null; value: number | null; scheduled: boolean };
  streak: { current: number; best: number; unit: "days" | "weeks" };
  week: { done: number; expected: number };
  metricKey?: string | null;
}

const statusIcon = { completed: Check, partial: Minus, missed: X, skipped: CircleSlash } as const;

/** One-tap habit row. Tap the circle to complete/undo; tap the row for more options. */
export function HabitRow({ h, date, dense }: { h: HabitLite; date: string; dense?: boolean }) {
  const log = useLogHabit();
  const st = h.today.status as keyof typeof statusIcon | null;
  const done = st === "completed" || st === "partial";
  const Icon = st ? statusIcon[st] : null;
  const weekly = h.frequency === "weekly_count";

  const toggle = () => {
    if (h.kind === "quantity") return openSheet({ kind: "habit-log", habitId: h.id, date });
    log.mutate({ habitId: h.id, date, status: st === "completed" ? null : "completed" });
  };

  const sub = [
    h.timeLabel,
    h.kind === "quantity" && h.targetValue ? `${h.today.value != null ? formatNumber(h.today.value, 0) : 0} מתוך ${formatNumber(h.targetValue, 0)}${h.unit ? ` ${h.unit}` : ""}` : null,
    weekly ? `${formatNumber(h.week.done, 1)} מתוך ${h.week.expected} השבוע` : null,
  ].filter(Boolean);

  return (
    <div className={cn("group flex items-center gap-3", dense ? "py-2" : "py-2.5")}>
      <button
        onClick={toggle}
        aria-label={done ? `בטל סימון: ${h.name}` : `סמן כבוצע: ${h.name}`}
        aria-pressed={done}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full border-2 transition-all duration-200 active:scale-90",
          st === "completed" ? "border-accent bg-accent text-accent-ink" : st === "partial" ? "border-accent bg-accent-soft text-accent-strong" : st === "missed" ? "border-negative/40 bg-negative-soft text-negative" : st === "skipped" ? "border-line-strong bg-sunken text-muted" : "border-line-strong text-transparent hover:border-accent",
        )}
      >
        {Icon ? <Icon className="size-5" strokeWidth={2.6} /> : <Check className="size-5 opacity-0 group-hover:opacity-30" />}
      </button>
      <button onClick={() => openSheet({ kind: "habit-log", habitId: h.id, date })} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-start">
        <div className="min-w-0">
          <div className={cn("truncate text-[15px] font-medium", st === "completed" && "text-muted line-through decoration-1 decoration-muted/50")}>{h.name}</div>
          {sub.length ? <div className="num truncate text-[13px] text-muted">{sub.join(" · ")}</div> : null}
        </div>
        {h.streak.current >= 2 ? (
          <span className="num flex shrink-0 items-center gap-0.5 text-xs text-muted" title={`רצף של ${h.streak.current} ${h.streak.unit === "weeks" ? "שבועות" : "פעמים"}`}>
            <Flame className="size-3.5 text-warning" />
            {h.streak.current}
          </span>
        ) : null}
      </button>
    </div>
  );
}
