"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/client/api";
import { qk, useWeeklyReview } from "@/client/queries";
import { useToday } from "@/client/today";
import { addDays, startOfWeek } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Button } from "../ui/button";
import { ErrorState, ProgressBar, Skeleton } from "../ui/misc";

interface Fact {
  id: string;
  text: string;
}
interface Facts {
  weekStart: string;
  weekEnd: string;
  complete: boolean;
  items: Fact[];
  happened: Fact[];
  changes: (Fact & { good: boolean | null })[];
  habits: { name: string; tier: string; done: number; expected: number; prevRate: number | null }[];
  goals: { title: string; progressLabel: string; progress: number | null; daysLeft: number | null }[];
  correlations: { id: string; title: string; summary: string; confidence: string | null }[];
  priorWeeks: number;
}
interface Narrative {
  summary?: string;
  positives?: { text: string; evidence: string[] }[];
  concerns?: { text: string; evidence: string[] }[];
  questions?: string[];
  observations?: { type: string; text: string; evidence: string[] }[];
  generated?: string;
}

const OBS: Record<string, string> = { pattern: "דפוס", hypothesis: "השערה", recommendation: "המלצה" };

export function WeeklyReview() {
  const today = useToday();
  const [week, setWeek] = useState(addDays(startOfWeek(today), -7));
  const { data, isLoading, error, refetch } = useWeeklyReview(week);
  const qc = useQueryClient();
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!data || data.narrative || asked.current === week) return;
    asked.current = week;
    void api.post("/api/reports/weekly/narrate", { week }).then(() => qc.invalidateQueries({ queryKey: qk.weekly(week) }));
  }, [data, week, qc]);

  const f = data?.facts as Facts | undefined;
  const n = (data?.narrative ?? null) as Narrative | null;
  const factText = new Map((f?.items ?? []).map((i) => [i.id, i.text]));
  const current = startOfWeek(today);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => setWeek(addDays(week, -7))} aria-label="שבוע קודם">
          <ChevronRight className="size-5" />
        </Button>
        <div className="text-center">
          <div className="text-[16px] font-semibold">{week === current ? "השבוע (עד עכשיו)" : week === addDays(current, -7) ? "השבוע שעבר" : "שבוע"}</div>
          <div className="num text-[13px] text-muted">
            {formatDate(week, { short: true })} – {formatDate(addDays(week, 6), { short: true })}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setWeek(addDays(week, 7))} disabled={week >= current} aria-label="שבוע הבא">
          <ChevronLeft className="size-5" />
        </Button>
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-96 w-full rounded-[18px]" />
      ) : error && !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !f || !f.items.length ? (
        <Card className="p-6 text-center text-sm text-muted">אין מספיק נתונים לשבוע הזה.</Card>
      ) : (
        <>
          <Card className="p-4 md:p-5">
            <div className="text-xs font-medium text-accent">סיכום</div>
            {n?.summary ? <p className="mt-1.5 text-[16px] leading-relaxed">{n.summary}</p> : <Skeleton className="mt-2 h-12 w-full" />}
            {f.priorWeeks < 2 ? <p className="mt-2 text-[13px] text-muted">עדיין אין מספיק שבועות קודמים להשוואה — הסקירה תתעשר עם הזמן.</p> : null}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="1 · מה קרה">
              <Bullets items={f.happened.map((h) => h.text)} />
            </Section>
            <Section title="2 · מה השתנה" subtitle="לעומת ממוצע ארבעת השבועות הקודמים">
              {f.changes.length ? <Bullets items={f.changes.map((c) => c.text)} tones={f.changes.map((c) => c.good)} /> : <Muted>לא היו שינויים בולטים.</Muted>}
            </Section>
            <Section title="3 · מה עבד">
              {n?.positives?.length ? <Bullets items={n.positives.map((p) => p.text)} tones={n.positives.map(() => true)} /> : <Muted>—</Muted>}
            </Section>
            <Section title="4 · מה כדאי לשים לב">
              {n?.concerns?.length ? <Bullets items={n.concerns.map((p) => p.text)} tones={n.concerns.map(() => false)} /> : <Muted>אין משהו מדאיג.</Muted>}
            </Section>
            <Section title="5 · מטרות">
              {f.goals.length ? (
                <ul className="space-y-3">
                  {f.goals.map((g) => (
                    <li key={g.title}>
                      <div className="mb-1 flex justify-between gap-2 text-sm">
                        <span className="truncate">{g.title}</span>
                        <span className="shrink-0 text-muted">{g.progressLabel}</span>
                      </div>
                      <ProgressBar value={g.progress} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Muted>אין מטרות פעילות.</Muted>
              )}
            </Section>
            <Section title="6 · הרגלים">
              <ul className="space-y-2.5">
                {f.habits.map((h) => (
                  <li key={h.name}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate">{h.name}</span>
                      <span className="num shrink-0 text-muted">
                        {Math.round(h.done * 10) / 10}/{h.expected}
                      </span>
                    </div>
                    <ProgressBar value={h.expected ? h.done / h.expected : 0} />
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="7 · קשרים מעניינים">
              {f.correlations.length ? (
                <ul className="space-y-3">
                  {f.correlations.map((c) => (
                    <li key={c.id}>
                      <a href={`/insights/${c.id}`} className="block text-sm">
                        <div className="font-medium">{c.title}</div>
                        <div className="text-muted">{c.summary}</div>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <Muted>עוד לא זוהו קשרים — צריך כמה שבועות של נתונים.</Muted>
              )}
            </Section>
            <Section title="8 · שאלות ששווה לבדוק">{n?.questions?.length ? <Bullets items={n.questions} /> : <Muted>—</Muted>}</Section>
          </div>

          {n?.observations?.length ? (
            <Section title="9 · תצפיות">
              <ul className="space-y-3">
                {n.observations.map((o, i) => (
                  <li key={i} className="text-[15px] leading-relaxed">
                    <span className={cn("me-2 rounded-md px-1.5 py-0.5 text-xs font-medium", o.type === "hypothesis" ? "bg-info-soft text-info" : o.type === "recommendation" ? "bg-accent-soft text-accent-strong" : "bg-sunken text-ink-2")}>{OBS[o.type] ?? o.type}</span>
                    {o.text}
                    {o.evidence.length ? (
                      <details className="mt-1 text-[13px] text-muted">
                        <summary className="cursor-pointer">על מה זה מבוסס</summary>
                        <ul className="mt-1 list-disc ps-5">
                          {o.evidence.map((e) => (
                            <li key={e}>{factText.get(e)}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {n?.generated === "rules" ? <p className="px-1 text-[12px] text-faint">הסקירה נוסחה אוטומטית מהנתונים, בלי AI.</p> : null}
        </>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function Bullets({ items, tones }: { items: string[]; tones?: (boolean | null)[] }) {
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed">
          <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", tones?.[i] === true ? "bg-positive" : tones?.[i] === false ? "bg-negative" : "bg-faint")} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
