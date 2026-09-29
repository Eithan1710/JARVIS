"use client";
import Link from "next/link";
import { Flame, Plus, Repeat } from "lucide-react";
import { useHabits } from "@/client/queries";
import { openSheet } from "@/client/store";
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { PageIntro } from "@/components/features/insight";

function scheduleText(h: { frequency: string; scheduleDays: number[] | null; weeklyTarget: number | null }) {
  if (h.frequency === "daily") return "כל יום";
  if (h.frequency === "weekly_count") return `${h.weeklyTarget ?? 1} פעמים בשבוע`;
  const d = h.scheduleDays ?? [];
  if (d.length === 1) return `כל יום ${WEEKDAY_NAMES[d[0]]}`;
  return d.map((x) => WEEKDAY_SHORT[x]).join(" ");
}

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export default function HabitsPage() {
  const { data, isLoading, error, refetch } = useHabits();
  const groups = [
    { key: "main", title: "פעילויות מתוכננות", items: (data ?? []).filter((s) => s.habit.tier === "main") },
    { key: "side", title: "הרגלים יומיים", items: (data ?? []).filter((s) => s.habit.tier === "side") },
  ];
  return (
    <div className="animate-fade-in">
      <PageIntro
        description="כל הרגל נשמר כהיסטוריה יומית — כך אפשר לראות עקביות לאורך שבועות וחודשים, לא רק את היום."
        actions={
          <Button onClick={() => openSheet({ kind: "habit-form" })}>
            <Plus className="size-4" /> הרגל חדש
          </Button>
        }
      />
      {isLoading && !data ? (
        <Skeleton className="h-80 w-full rounded-[18px]" />
      ) : error && !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<Repeat className="size-6" />} title="עדיין אין הרגלים" body="התחל בהרגל אחד או שניים. אפשר תמיד להוסיף עוד." action={<Button onClick={() => openSheet({ kind: "habit-form" })}>הוספת הרגל</Button>} />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) =>
            g.items.length ? (
              <section key={g.key}>
                <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">{g.title}</h2>
                <Card className="divide-y divide-line">
                  {g.items.map((s) => (
                    <Link key={s.habit.id} href={`/habits/${s.habit.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2 md:px-5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium">{s.habit.name}</div>
                        <div className="mt-0.5 truncate text-[13px] text-muted">
                          {scheduleText(s.habit)}
                          {s.habit.timeLabel ? ` · ${s.habit.timeLabel}` : ""}
                          {s.habit.reminderEnabled ? " · תזכורת חכמה" : ""}
                        </div>
                        <div className="mt-2 flex gap-1" aria-label="14 הימים האחרונים">
                          {s.recent.map((r) => (
                            <span
                              key={r.date}
                              title={r.date}
                              className={cn(
                                "h-1.5 flex-1 rounded-full",
                                r.status === "completed" ? "bg-accent" : r.status === "partial" ? "bg-accent/50" : r.status === "missed" ? "bg-negative/35" : r.scheduled && s.habit.frequency !== "weekly_count" ? "bg-line-strong" : "bg-sunken",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="grid shrink-0 grid-cols-2 gap-4 text-center">
                        <div>
                          <div className="num text-[17px] font-semibold">{pct(s.rate30)}</div>
                          <div className="text-[11px] text-muted">30 יום</div>
                        </div>
                        <div>
                          <div className="num flex items-center justify-center gap-0.5 text-[17px] font-semibold">
                            {s.streak.current >= 2 ? <Flame className="size-3.5 text-warning" /> : null}
                            {s.streak.current}
                          </div>
                          <div className="text-[11px] text-muted">{s.streak.unit === "weeks" ? "שבועות ברצף" : "ברצף"}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </Card>
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
