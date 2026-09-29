"use client";
import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { useExperiments } from "@/client/queries";
import { openSheet } from "@/client/store";
import { formatRange } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/misc";
import { PageIntro } from "@/components/features/insight";
import { EXP_STATUS } from "@/components/features/experiment-status";


export default function ExperimentsPage() {
  const { data, isLoading, error, refetch } = useExperiments();
  return (
    <div className="animate-fade-in">
      <PageIntro
        description="משנים דבר אחד לתקופה מוגדרת, ו־NOVA משווה לתקופה שלפני: מה השתנה, כמה בטוח, ומה עוד השתנה במקביל."
        actions={
          <Button onClick={() => openSheet({ kind: "experiment-form" })}>
            <Plus className="size-4" /> ניסוי חדש
          </Button>
        }
      />
      {isLoading && !data ? (
        <Skeleton className="h-48 w-full rounded-[18px]" />
      ) : error && !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<FlaskConical className="size-6" />} title="אין ניסויים עדיין" body="למשל: „ללכת לישון לפני 23:30 למשך 30 יום” — ולבדוק מה קרה לאנרגיה ולריכוז." action={<Button onClick={() => openSheet({ kind: "experiment-form" })}>ניסוי ראשון</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {data.map((e) => (
            <Link key={e.id} href={`/experiments/${e.id}`} className="card block p-4 transition-shadow hover:shadow-float md:p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[16px] font-semibold leading-snug">{e.title}</h2>
                <Badge tone={EXP_STATUS[e.status].tone}>{EXP_STATUS[e.status].label}</Badge>
              </div>
              <p className="num mt-1 text-[13px] text-muted">{formatRange(e.startDate, e.endDate)}</p>
              {e.status === "active" ? (
                <div className="mt-3">
                  <ProgressBar value={e.dayIndex / e.totalDays} />
                  <p className="mt-1 text-xs text-muted">
                    יום {e.dayIndex} מתוך {e.totalDays}
                  </p>
                </div>
              ) : null}
              {e.hypothesis ? <p className="mt-2 line-clamp-2 text-sm text-ink-2">{e.hypothesis}</p> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
