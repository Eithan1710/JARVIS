"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCheckin, useHabits, useTimeline } from "@/client/queries";
import { openSheet } from "@/client/store";
import { useToday } from "@/client/today";
import { addDays } from "@/lib/dates";
import { formatDayTitle, formatRelativeDay } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { HabitRow } from "@/components/features/habit-row";
import { DayItems } from "@/components/features/timeline-items";
import { Repeat } from "lucide-react";

export default function TodayPage() {
  const today = useToday();
  const params = useSearchParams();
  const [date, setDate] = useState(today);
  const { data: habits, isLoading, error, refetch } = useHabits(date === today ? undefined : date);
  const { data: checkin } = useCheckin(date);
  const { data: tl } = useTimeline(date, date);

  useEffect(() => {
    if (params.get("checkin") === "1") openSheet("checkin");
  }, [params]);

  const list = (habits ?? []).map((s) => ({
    id: s.habit.id,
    name: s.habit.name,
    tier: s.habit.tier,
    kind: s.habit.kind,
    unit: s.habit.unit,
    targetValue: s.habit.targetValue,
    frequency: s.habit.frequency,
    timeLabel: s.habit.timeLabel,
    today: s.today,
    streak: s.streak,
    week: s.week,
  }));
  const scheduled = list.filter((h) => h.today.scheduled && h.frequency !== "weekly_count");
  const main = scheduled.filter((h) => h.tier === "main");
  const side = scheduled.filter((h) => h.tier === "side");
  const weekly = list.filter((h) => h.frequency === "weekly_count");
  const notToday = list.filter((h) => !h.today.scheduled && h.frequency !== "weekly_count");
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="animate-fade-in">
      {/* Date switcher — RTL: "previous" points right */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, -1))} aria-label="יום קודם">
          <ChevronRight className="size-5" />
        </Button>
        <div className="text-center">
          <div className="text-[17px] font-semibold">{formatRelativeDay(date, today)}</div>
          <div className="text-[13px] text-muted">{formatDayTitle(date)}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="יום הבא">
          <ChevronLeft className="size-5" />
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="space-y-4 lg:col-span-7">
          {isLoading && !habits ? (
            <Skeleton className="h-72 w-full rounded-[18px]" />
          ) : error && !habits ? (
            <ErrorState onRetry={() => refetch()} />
          ) : !list.length ? (
            <Card>
              <EmptyState icon={<Repeat className="size-6" />} title="עדיין אין הרגלים" body="הוסף פעילות מתוכננת (כמו אימון) או הרגל יומי (כמו שינה של 7 שעות)." action={<Button onClick={() => openSheet({ kind: "habit-form" })}>הוספת הרגל</Button>} />
            </Card>
          ) : (
            <>
              {main.length ? (
                <Card>
                  <CardHeader title="פעילויות מתוכננות" />
                  <CardBody className="divide-y divide-line pt-1">
                    {main.map((h) => (
                      <HabitRow key={h.id} h={h} date={date} />
                    ))}
                  </CardBody>
                </Card>
              ) : null}
              {side.length ? (
                <Card>
                  <CardHeader title="הרגלים יומיים" />
                  <CardBody className="divide-y divide-line pt-1">
                    {side.map((h) => (
                      <HabitRow key={h.id} h={h} date={date} />
                    ))}
                  </CardBody>
                </Card>
              ) : null}
              {weekly.length ? (
                <Card>
                  <CardHeader title="יעדים שבועיים" subtitle="מתי שנוח במהלך השבוע" />
                  <CardBody className="divide-y divide-line pt-1">
                    {weekly.map((h) => (
                      <HabitRow key={h.id} h={h} date={date} />
                    ))}
                  </CardBody>
                </Card>
              ) : null}
              {notToday.length ? (
                <div className="px-1">
                  <button className="text-sm text-muted hover:text-ink" onClick={() => setShowAll((x) => !x)}>
                    {showAll ? "הסתר" : `${notToday.length} הרגלים לא מתוכננים היום`}
                  </button>
                  {showAll ? (
                    <Card className="mt-2">
                      <CardBody className="divide-y divide-line pt-1">
                        {notToday.map((h) => (
                          <HabitRow key={h.id} h={h} date={date} dense />
                        ))}
                      </CardBody>
                    </Card>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-4 lg:col-span-5">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold">צ׳ק־אין</div>
                <div className="text-[13px] text-muted">
                  {checkin ? [checkin.mood && `מצב רוח ${checkin.mood}`, checkin.energy && `אנרגיה ${checkin.energy}`, checkin.focus && `ריכוז ${checkin.focus}`].filter(Boolean).join(" · ") || "מולא" : "עוד לא מולא"}
                </div>
              </div>
              <Button variant={checkin ? "subtle" : "primary"} size="sm" onClick={() => openSheet("checkin")}>
                {checkin ? "עריכה" : "למילוי"}
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="רישום מהיר" />
            <CardBody className="flex flex-wrap gap-2">
              {[
                ["שינה", { kind: "metric", metricKey: "sleep_hours" }],
                ["אימון", { kind: "metric", metricKey: "workout_minutes" }],
                ["הוצאה", { kind: "transaction" }],
                ["עבודה", { kind: "metric", metricKey: "work_hours" }],
                ["צעדים", { kind: "metric", metricKey: "steps" }],
                ["יומן", { kind: "journal" }],
              ].map(([l, s]) => (
                <button key={l as string} onClick={() => openSheet(s as never)} className="inline-flex h-10 items-center gap-1 rounded-full bg-sunken px-4 text-sm font-medium hover:bg-line">
                  <Plus className="size-4 text-accent" />
                  {l as string}
                </button>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="מה נרשם" />
            <CardBody>{tl?.[0]?.items.length ? <DayItems items={tl[0].items} /> : <p className="py-4 text-center text-sm text-muted">עוד לא נרשם כלום ליום הזה.</p>}</CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
