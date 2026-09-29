"use client";
import { useState } from "react";
import { History } from "lucide-react";
import { useTimeline } from "@/client/queries";
import { useToday } from "@/client/today";
import { addDays, diffDays } from "@/lib/dates";
import { formatDayTitle, formatRelativeDay } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip, Input } from "@/components/ui/field";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { DayItems } from "@/components/features/timeline-items";

type Range = "week" | "month" | "custom";

export default function TimelinePage() {
  const today = useToday();
  const [range, setRange] = useState<Range>("week");
  const [customFrom, setCustomFrom] = useState(addDays(today, -13));
  const [customTo, setCustomTo] = useState(today);
  const [extra, setExtra] = useState(0);

  const to = range === "custom" ? customTo : today;
  const baseFrom = range === "week" ? addDays(today, -6) : range === "month" ? addDays(today, -29) : customFrom;
  const from = addDays(baseFrom, -extra);
  const { data, isLoading, error, refetch, isFetching } = useTimeline(from, to);

  return (
    <div className="animate-fade-in">
      <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4">
        {(
          [
            ["week", "שבוע"],
            ["month", "חודש"],
            ["custom", "טווח"],
          ] as const
        ).map(([k, l]) => (
          <Chip
            key={k}
            active={range === k}
            onClick={() => {
              setRange(k);
              setExtra(0);
            }}
          >
            {l}
          </Chip>
        ))}
      </div>
      {range === "custom" ? (
        <div className="mb-4 grid max-w-md grid-cols-2 gap-2">
          <Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="ltr num" aria-label="מתאריך" />
          <Input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} className="ltr num" aria-label="עד תאריך" />
        </div>
      ) : null}

      {isLoading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-[18px]" />
          ))}
        </div>
      ) : error && !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<History className="size-6" />} title="אין עדיין רשומות בטווח הזה" body="כל הרגל, צ׳ק־אין, מדד או רשומת יומן יופיעו כאן לפי סדר הזמן." />
        </Card>
      ) : (
        <div className="relative space-y-4">
          {data.map((day) => (
            <section key={day.date} aria-label={formatDayTitle(day.date)}>
              <div className="sticky top-[calc(52px+var(--safe-top))] z-10 -mx-1 mb-2 bg-bg/90 px-1 py-1.5 backdrop-blur md:top-16">
                <span className="text-[15px] font-semibold">{formatRelativeDay(day.date, today)}</span>
                {diffDays(today, day.date) >= 7 ? null : <span className="ms-2 text-[13px] text-muted">{formatDayTitle(day.date)}</span>}
              </div>
              <Card className="px-4 py-1 md:px-5">
                <DayItems items={day.items} />
              </Card>
            </section>
          ))}
          {diffDays(to, from) < 112 ? (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => setExtra((x) => x + (range === "week" ? 7 : 30))} loading={isFetching}>
                ימים קודמים
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
