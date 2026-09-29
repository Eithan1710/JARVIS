"use client";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, MessageCircle, Pin, PinOff } from "lucide-react";
import { useInsight } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { api } from "@/client/api";
import { formatRange } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState, Skeleton } from "@/components/ui/misc";
import { ConfidenceBadge, EVIDENCE_LABEL, Evidence, KIND_LABEL } from "@/components/features/insight";

export default function InsightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading, error, refetch } = useInsight(id);
  const set = useAction((status: string) => api.patch(`/api/insights/${id}`, { status }), { invalidate: [["insight", id], ["insights"], ["dashboard"]] });

  if (isLoading && !data) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  const i = data.insight;
  const ev = EVIDENCE_LABEL[i.evidenceLevel];

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-4">
      {/* Answer first */}
      <Card className="p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-accent">{KIND_LABEL[i.kind] ?? "תובנה"}</span>
          {i.periodStart && i.periodEnd ? <span className="num text-xs text-muted">· {formatRange(i.periodStart, i.periodEnd)}</span> : null}
        </div>
        <h1 className="text-title font-semibold leading-snug">{i.title}</h1>
        <p className="mt-3 text-[17px] leading-relaxed">{i.summary}</p>
        {i.body ? <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{i.body}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <ConfidenceBadge level={i.confidence} />
          <Badge>{ev?.label ?? "תצפית"}</Badge>
          {i.sampleSize ? <Badge>{i.sampleSize} ימים</Badge> : null}
        </div>
      </Card>

      {/* Then details */}
      <Card>
        <CardHeader title="כמה אפשר לסמוך על זה?" />
        <CardBody className="space-y-3 text-[15px] leading-relaxed">
          <p>{i.confidenceReason}</p>
          {ev ? (
            <p className="text-ink-2">
              <span className="font-medium">{ev.label}:</span> {ev.hint}
            </p>
          ) : null}
          {i.caveats.length ? (
            <div className="rounded-xl bg-warning-soft/60 p-3.5">
              <div className="mb-1 text-sm font-semibold text-warning">הסתייגויות</div>
              <ul className="list-disc space-y-1 ps-5 text-[14px] text-ink-2">
                {i.caveats.map((c, k) => (
                  <li key={k}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Then evidence */}
      {data.evidence.length ? (
        <Card>
          <CardHeader title="הראיות" subtitle="המספרים שעליהם התובנה מבוססת — מחושבים ישירות מהנתונים, בלי AI." />
          <CardBody>
            <Evidence blocks={data.evidence.map((e) => ({ kind: e.kind, label: e.label, data: e.data as Record<string, unknown> }))} />
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2 pb-4">
        <Link href={`/ask?q=${encodeURIComponent(`ספר לי עוד על: ${i.title}. מה עוד יכול להסביר את זה?`)}`}>
          <Button variant="primary">
            <MessageCircle className="size-4" /> לחקור עם NOVA
          </Button>
        </Link>
        {i.status === "pinned" ? (
          <Button variant="secondary" onClick={() => set.mutate("seen")}>
            <PinOff className="size-4" /> ביטול נעיצה
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => set.mutate("pinned")}>
            <Pin className="size-4" /> נעיצה
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            set.mutate("dismissed");
            router.push("/insights");
          }}
        >
          <EyeOff className="size-4" /> לא רלוונטי
        </Button>
      </div>
    </div>
  );
}
