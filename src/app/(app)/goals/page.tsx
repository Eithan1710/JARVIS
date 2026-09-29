"use client";
import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { useGoals } from "@/client/queries";
import { openSheet } from "@/client/store";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/misc";
import { PageIntro } from "@/components/features/insight";

const STATUS: Record<string, { label: string; tone: "accent" | "positive" | "neutral" | "warning" }> = {
  active: { label: "פעילה", tone: "accent" },
  completed: { label: "הושגה", tone: "positive" },
  paused: { label: "מושהית", tone: "neutral" },
  abandoned: { label: "נעזבה", tone: "neutral" },
};

export default function GoalsPage() {
  const { data, isLoading, error, refetch } = useGoals();
  return (
    <div className="animate-fade-in">
      <PageIntro
        description="מטרה היא יעד. ההרגלים הם הדרך. כאן רואים את שניהם יחד — ואם הקצב מספיק."
        actions={
          <Button onClick={() => openSheet({ kind: "goal-form" })}>
            <Plus className="size-4" /> מטרה חדשה
          </Button>
        }
      />
      {isLoading && !data ? (
        <Skeleton className="h-64 w-full rounded-[18px]" />
      ) : error && !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<Target className="size-6" />} title="אין עדיין מטרות" body="למשל: „ללמוד React” עם 5 שעות למידה בשבוע, או „לרדת ל־76 ק״ג” עד תאריך מסוים." action={<Button onClick={() => openSheet({ kind: "goal-form" })}>הוספת מטרה</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {data.map((g) => {
            const behind = g.expectedProgress != null && g.progress != null && g.progress + 0.1 < g.expectedProgress;
            return (
              <Link key={g.goal.id} href={`/goals/${g.goal.id}`} className="card block p-4 transition-shadow hover:shadow-float md:p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[16px] font-semibold leading-snug">{g.goal.title}</h2>
                  <Badge tone={STATUS[g.goal.status].tone}>{STATUS[g.goal.status].label}</Badge>
                </div>
                <div className="mt-4">
                  <ProgressBar value={g.progress} expected={g.expectedProgress} tone={behind ? "warning" : g.goal.status === "completed" ? "positive" : "accent"} />
                  <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-ink-2">{g.progressLabel}</span>
                    {g.goal.deadline ? <span className="num shrink-0 text-muted">{g.daysLeft != null && g.daysLeft >= 0 ? `עוד ${g.daysLeft} ימים` : formatDate(g.goal.deadline)}</span> : null}
                  </div>
                  {behind ? <p className="mt-2 text-[13px] text-warning">מאחורי הקצב הליניארי ({Math.round((g.expectedProgress ?? 0) * 100)}% צפוי עד היום)</p> : null}
                  {g.habitConsistency != null ? <p className="mt-1 text-[13px] text-muted">עקביות ההרגלים הקשורים: {Math.round(g.habitConsistency * 100)}%</p> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
