"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Trash2 } from "lucide-react";
import { useHabit } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { openSheet } from "@/client/store";
import { useToday } from "@/client/today";
import { api } from "@/client/api";
import { useIsMobile } from "@/client/hooks";
import { minutesToHHMM } from "@/lib/dates";
import { formatDate, WEEKDAY_NAMES } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton, Stat } from "@/components/ui/misc";
import { HabitHeatmap, TrendChart } from "@/components/charts";

const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const STATUS: Record<string, string> = { completed: "בוצע", partial: "חלקית", missed: "לא בוצע", skipped: "דולג" };
const SOURCE: Record<string, string> = { manual: "", system: "סומן אוטומטית", metric: "מנתונים", demo: "דוגמה" };

export default function HabitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const today = useToday();
  const mobile = useIsMobile();
  const { data, isLoading, error, refetch } = useHabit(id);
  const archive = useAction(() => api.patch(`/api/habits/${id}`, { archived: true }), { success: "ההרגל הועבר לארכיון", onSuccess: () => router.push("/habits") });
  const remove = useAction(() => api.del(`/api/habits/${id}`), { success: "ההרגל נמחק", onSuccess: () => router.push("/habits") });

  if (isLoading && !data) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  const h = data.habit;
  const weekly = h.frequency === "weekly_count";
  // Days map for the heatmap (scheduled flag matters for specific-day habits).
  const evMap = new Map(data.events.map((e) => [e.date, e]));
  const heat = [];
  for (let i = 0; i < 26 * 7; i++) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    const scheduled = iso >= data.startDate && (h.frequency !== "specific_days" || (h.scheduleDays ?? []).includes(wd));
    heat.push({ date: iso, status: evMap.get(iso)?.status ?? null, scheduled });
  }
  const weekdayPoints = data.byWeekday.map((w) => ({ x: WEEKDAY_NAMES[w.weekday], y: w.rate }));

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h1 className="text-title font-semibold">{h.name}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {h.tier === "main" ? "פעילות מתוכננת" : "הרגל יומי"}
            {h.timeLabel ? ` · ${h.timeLabel}` : ""}
            {h.description ? ` · ${h.description}` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="subtle" size="sm" onClick={() => openSheet({ kind: "habit-form", habitId: id })}>
            <Pencil className="size-4" /> עריכה
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => archive.mutate(undefined)} aria-label="העברה לארכיון" title="ארכיון (שומר היסטוריה)">
            <Archive className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="מחיקה"
            onClick={() => {
              if (confirm("למחוק את ההרגל וכל ההיסטוריה שלו? אפשר במקום זה להעביר לארכיון.")) remove.mutate(undefined);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 md:p-5">
        <Stat label="רצף נוכחי" value={`${data.streak.current}`} sub={data.streak.unit === "weeks" ? "שבועות" : "פעמים מתוכננות"} />
        <Stat label="השיא" value={`${data.streak.best}`} sub={data.streak.unit === "weeks" ? "שבועות" : "פעמים"} />
        <Stat label="השבוע" value={`${Math.round(data.week.done * 10) / 10}/${data.week.expected}`} />
        <Stat label="30 יום" value={pct(data.rates.d30.rate)} sub={`${Math.round(data.rates.d30.done)} מתוך ${data.rates.d30.expected}`} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="היסטוריה" subtitle={weekly ? "כל ריבוע הוא יום" : "ימים מתוכננים בלבד נספרים"} />
          <CardBody>
            <HabitHeatmap days={heat} weeks={mobile ? 18 : 26} today={today} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="עקביות לאורך זמן" />
          <CardBody>
            <dl className="grid grid-cols-4 gap-2 text-center">
              {(
                [
                  ["7 ימים", data.rates.d7.rate],
                  ["30 יום", data.rates.d30.rate],
                  ["90 יום", data.rates.d90.rate],
                  ["שנה", data.rates.d365.rate],
                ] as const
              ).map(([l, v]) => (
                <div key={l} className="rounded-xl bg-sunken py-3">
                  <dd className="num text-lg font-semibold">{pct(v)}</dd>
                  <dt className="text-[11px] text-muted">{l}</dt>
                </div>
              ))}
            </dl>
            {data.typicalMinutes != null ? <p className="mt-3 text-sm text-muted">בדרך כלל מסומן בסביבות {minutesToHHMM(data.typicalMinutes)}.</p> : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="לפי יום בשבוע" subtitle="שיעור השלמה בימים שבהם היה מתוכנן" />
        <CardBody>
          <TrendChart points={weekdayPoints} format="percent" kind="bar" height={180} label="שיעור השלמה" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="יומן פעולות" subtitle="כל שינוי נשמר כהיסטוריה" />
        <CardBody>
          <ul className="divide-y divide-line">
            {[...data.events]
              .reverse()
              .slice(0, 40)
              .map((e) => (
                <li key={e.date} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="num text-ink-2">{formatDate(e.date, { year: e.date.slice(0, 4) !== today.slice(0, 4) })}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{e.note ?? ""}</span>
                  <span className="shrink-0">
                    {STATUS[e.status]}
                    {e.value != null ? ` · ${e.value}` : ""}
                    {SOURCE[e.source] ? <span className="text-faint"> · {SOURCE[e.source]}</span> : null}
                  </span>
                </li>
              ))}
          </ul>
          {!data.events.length ? <p className="py-6 text-center text-sm text-muted">עוד אין היסטוריה.</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}
