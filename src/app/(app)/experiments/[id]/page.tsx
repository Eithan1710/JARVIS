"use client";
import { use, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus, Sparkles, Trash2 } from "lucide-react";
import { useExperiment } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { api } from "@/client/api";
import { formatRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState, ProgressBar, Skeleton } from "@/components/ui/misc";
import { EXP_STATUS } from "@/components/features/experiment-status";
import type { ExperimentResult, ExperimentSummary } from "@/server/services/experiments";

const VERDICT: Record<string, { label: string; tone: "positive" | "neutral" | "warning" | "info" }> = {
  promising: { label: "נראה מבטיח", tone: "positive" },
  no_clear_change: { label: "אין שינוי ברור", tone: "neutral" },
  negative: { label: "כיוון לא רצוי", tone: "warning" },
  inconclusive: { label: "עוד מוקדם לדעת", tone: "info" },
};

export default function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: e, isLoading, error, refetch } = useExperiment(id);
  const analyze = useMutation({
    mutationFn: (summarize: boolean) => api.post<{ result: ExperimentResult; summary?: ExperimentSummary }>(`/api/experiments/${id}/analyze`, { summarize }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["experiment", id] }),
  });
  const cancel = useAction(() => api.post(`/api/experiments/${id}/cancel`), { success: "הניסוי בוטל" });
  const remove = useAction(() => api.del(`/api/experiments/${id}`), { success: "נמחק", onSuccess: () => router.push("/experiments") });
  const ran = useRef(false);

  useEffect(() => {
    if (e && !ran.current && e.status !== "planned") {
      ran.current = true;
      analyze.mutate(e.status === "completed" && !e.aiSummary);
    }
  }, [e, analyze]);

  if (isLoading && !e) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (error || !e) return <ErrorState onRetry={() => refetch()} />;
  const r = (analyze.data?.data?.result ?? e.result) as ExperimentResult | null;
  const s = (analyze.data?.data?.summary ?? e.aiSummary) as ExperimentSummary | null;
  const st = EXP_STATUS[e.status];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="num text-[13px] text-muted">{formatRange(e.startDate, e.endDate)}</span>
          </div>
          <h1 className="text-title font-semibold">{e.title}</h1>
          {e.hypothesis ? <p className="mt-1 text-[15px] text-muted">השערה: {e.hypothesis}</p> : null}
        </div>
        <div className="flex gap-1">
          {e.status === "active" || e.status === "planned" ? (
            <Button variant="ghost" size="sm" onClick={() => confirm("לבטל את הניסוי?") && cancel.mutate(undefined)}>
              ביטול
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" aria-label="מחיקה" onClick={() => confirm("למחוק את הניסוי?") && remove.mutate(undefined)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {e.status === "active" ? (
        <Card className="p-4 md:p-5">
          <div className="mb-2 flex justify-between text-sm">
            <span>התקדמות</span>
            <span className="num text-muted">
              יום {e.dayIndex} מתוך {e.totalDays}
            </span>
          </div>
          <ProgressBar value={e.dayIndex / e.totalDays} />
        </Card>
      ) : null}

      {e.status === "planned" ? <Card className="p-5 text-[15px] text-muted">הניסוי עוד לא התחיל. בינתיים NOVA אוספת נתוני בסיס להשוואה.</Card> : null}

      {s ? (
        <Card className="p-5 md:p-6">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone={VERDICT[s.verdict]?.tone ?? "neutral"}>{VERDICT[s.verdict]?.label}</Badge>
            {s.generated === "ai" ? (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Sparkles className="size-3" /> סיכום AI
              </span>
            ) : null}
          </div>
          <p className="text-[17px] font-medium leading-relaxed">{s.headline}</p>
          {s.observations.length ? (
            <>
              <h3 className="mb-1 mt-4 text-[13px] font-semibold text-muted">מה הנתונים מראים (תצפית)</h3>
              <ul className="list-disc space-y-1 ps-5 text-[15px] leading-relaxed">
                {s.observations.map((o, i) => (
                  <li key={i}>{o.text}</li>
                ))}
              </ul>
            </>
          ) : null}
          {s.interpretation.length ? (
            <>
              <h3 className="mb-1 mt-4 text-[13px] font-semibold text-muted">מה זה עשוי לומר (פרשנות)</h3>
              <ul className="list-disc space-y-1 ps-5 text-[15px] leading-relaxed text-ink-2">
                {s.interpretation.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </>
          ) : null}
          {s.nextSteps.length ? (
            <>
              <h3 className="mb-1 mt-4 text-[13px] font-semibold text-muted">מה אפשר לעשות הלאה</h3>
              <ul className="list-disc space-y-1 ps-5 text-[15px] leading-relaxed text-ink-2">
                {s.nextSteps.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      {analyze.isPending && !r ? <Skeleton className="h-64 w-full rounded-[18px]" /> : null}

      {r ? (
        <>
          <Card>
            <CardHeader title="לפני מול במהלך" subtitle={`בסיס: ${formatRange(r.baseline.from, r.baseline.to)} · ניסוי: ${formatRange(r.during.from, r.during.to)}`} />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 text-start font-medium">מדד</th>
                      <th className="py-2 text-start font-medium">לפני</th>
                      <th className="py-2 text-start font-medium">במהלך</th>
                      {r.after ? <th className="py-2 text-start font-medium">אחרי</th> : null}
                      <th className="py-2 text-start font-medium">שינוי</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.targets.map((t) => (
                      <tr key={t.key}>
                        <td className="py-2.5 font-medium">{t.label}</td>
                        <td className="num py-2.5 text-ink-2">{t.baseline}</td>
                        <td className="num py-2.5 font-semibold">{t.during}</td>
                        {r.after ? <td className="num py-2.5 text-ink-2">{t.after}</td> : null}
                        <td className={cn("num py-2.5", t.good === true ? "text-positive" : t.good === false ? "text-negative" : "text-muted")}>
                          <span className="inline-flex items-center gap-1">
                            {t.direction === "up" ? <ArrowUp className="size-3.5" /> : t.direction === "down" ? <ArrowDown className="size-3.5" /> : <Minus className="size-3.5" />}
                            {t.difference}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-3 space-y-1 text-[13px] text-muted">
                {r.targets.map((t) => (
                  <li key={t.key}>
                    {t.label}: {t.confidence}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          {r.compliance ? (
            <Card className="p-4 md:p-5">
              <div className="mb-2 flex justify-between text-sm">
                <span>עמידה בניסוי</span>
                <span className="num text-muted">{r.compliance.rate != null ? `${Math.round(r.compliance.rate * 100)}%` : "—"}</span>
              </div>
              <ProgressBar value={r.compliance.rate} />
            </Card>
          ) : null}
          {r.confounders.length || r.dataNotes.length ? (
            <Card>
              <CardHeader title="דברים שעלולים לבלבל" subtitle="שינויים אחרים באותה תקופה" />
              <CardBody className="space-y-2 text-[14px] leading-relaxed text-ink-2">
                {r.confounders.map((c) => (
                  <p key={c.key}>
                    {c.label}: {c.baseline} ← {c.during}
                  </p>
                ))}
                {r.dataNotes.map((d, i) => (
                  <p key={i} className="text-muted">
                    {d}
                  </p>
                ))}
              </CardBody>
            </Card>
          ) : null}
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => analyze.mutate(true)} loading={analyze.isPending}>
              <Sparkles className="size-4" /> ניתוח וסיכום מחדש
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
