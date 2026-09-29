"use client";
import { BedDouble, BookOpenText, CalendarDays, Check, CircleSlash, Smile, Target, Wallet, X, Activity } from "lucide-react";
import type { TimelineDay } from "@/server/services/timeline";
import { METRIC_MAP, SPENDING_LABEL } from "@/lib/metrics";
import { formatCurrency, formatMetricValue } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = TimelineDay["items"][number];

const SOURCE_LABEL: Record<string, string> = {
  manual: "ידני",
  demo: "דוגמה",
  system: "אוטומטי",
  metric: "מנתונים",
  health_webhook: "Apple Health",
  ics_calendar: "יומן",
  weather: "מזג אוויר",
  github: "GitHub",
  csv_metrics: "קובץ CSV",
  csv_transactions: "קובץ CSV",
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

const fmtTime = (iso: string) => new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

function Row({ icon: Icon, tone, children, meta }: { icon: typeof Check; tone?: string; children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", tone ?? "bg-sunken text-muted")}>
        <Icon className="size-4" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed">{children}</div>
      {meta ? <span className="num shrink-0 pt-0.5 text-xs text-faint">{meta}</span> : null}
    </li>
  );
}

const ORDER: Record<Item["kind"], number> = { checkin: 0, metric: 1, habit: 2, event: 3, spending: 4, goal_progress: 5, journal: 6 };

export function DayItems({ items }: { items: Item[] }) {
  const sorted = [...items].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const habits = sorted.filter((i): i is Extract<Item, { kind: "habit" }> => i.kind === "habit");
  const others = sorted.filter((i) => i.kind !== "habit");
  const done = habits.filter((h) => h.status === "completed" || h.status === "partial");
  const notDone = habits.filter((h) => h.status === "missed");
  return (
    <ul className="divide-y divide-line/70">
      {others.map((it, idx) => {
        switch (it.kind) {
          case "checkin":
            return (
              <Row key={idx} icon={Smile} tone="bg-accent-soft text-accent">
                <span className="num">
                  {[it.mood != null && `מצב רוח ${it.mood}/10`, it.energy != null && `אנרגיה ${it.energy}/10`, it.focus != null && `ריכוז ${it.focus}/10`].filter(Boolean).join(" · ") || "צ׳ק־אין"}
                </span>
                {it.highlight ? <div className="text-ink-2">⭐ {it.highlight}</div> : null}
                {it.tags.length ? <div className="text-xs text-muted">{it.tags.join(" · ")}</div> : null}
              </Row>
            );
          case "metric": {
            const def = METRIC_MAP.get(it.metricKey);
            return (
              <Row key={idx} icon={it.metricKey === "sleep_hours" || it.metricKey === "bedtime" ? BedDouble : Activity} meta={sourceLabel(it.source)}>
                <span className="text-muted">{def?.label ?? it.metricKey}: </span>
                <span className="num font-medium">{formatMetricValue(it.metricKey, it.value)}</span>
                {it.note ? <span className="text-muted"> · {it.note}</span> : null}
              </Row>
            );
          }
          case "event":
            return (
              <Row key={idx} icon={CalendarDays} meta={it.allDay ? "כל היום" : fmtTime(it.startAt)}>
                {it.title}
              </Row>
            );
          case "spending":
            return (
              <Row key={idx} icon={Wallet}>
                <span className="text-muted">הוצאות: </span>
                <span className="num font-medium">{formatCurrency(it.total)}</span>
                <div className="text-xs text-muted">{it.items.slice(0, 4).map((t) => `${t.merchant ?? SPENDING_LABEL.get(t.category) ?? t.category} ${formatCurrency(t.amount)}`).join(" · ")}</div>
              </Row>
            );
          case "goal_progress":
            return (
              <Row key={idx} icon={Target}>
                התקדמות ב„{it.goalTitle}”: <span className="num font-medium">{it.value}</span> {it.unit ?? ""}
              </Row>
            );
          case "journal":
            return (
              <Row key={idx} icon={BookOpenText} tone={it.important ? "bg-warning-soft text-warning" : undefined} meta={fmtTime(it.at)}>
                {it.title ? <div className="font-medium">{it.title}</div> : null}
                <p className="line-clamp-3 text-ink-2">{it.body}</p>
              </Row>
            );
          default:
            return null;
        }
      })}
      {done.length ? (
        <Row icon={Check} tone="bg-accent-soft text-accent">
          <span className="text-muted">בוצע: </span>
          {done.map((h) => h.name + (h.status === "partial" ? " (חלקי)" : "")).join(" · ")}
        </Row>
      ) : null}
      {notDone.length ? (
        <Row icon={X} tone="bg-negative-soft text-negative">
          <span className="text-muted">לא בוצע: </span>
          {notDone.map((h) => h.name).join(" · ")}
        </Row>
      ) : null}
      {habits.some((h) => h.status === "skipped") ? (
        <Row icon={CircleSlash}>
          <span className="text-muted">דולג: </span>
          {habits.filter((h) => h.status === "skipped").map((h) => h.name).join(" · ")}
        </Row>
      ) : null}
    </ul>
  );
}

