"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lightbulb, RefreshCw } from "lucide-react";
import { useInsights } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { api } from "@/client/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip, Segmented } from "@/components/ui/field";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { InsightCard, KIND_LABEL, PageIntro } from "@/components/features/insight";
import { WeeklyReview } from "@/components/features/weekly-review";

export default function InsightsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "weekly" ? "weekly" : "insights";
  const setTab = (t: "insights" | "weekly") => router.replace(t === "weekly" ? "/insights?tab=weekly" : "/insights", { scroll: false });
  return (
    <div className="animate-fade-in">
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-4 w-full md:w-auto"
        options={[
          { value: "insights", label: "תובנות" },
          { value: "weekly", label: "סקירה שבועית" },
        ]}
      />
      {tab === "weekly" ? <WeeklyReview /> : <InsightList />}
    </div>
  );
}

function InsightList() {
  const { data, isLoading, error, refetch } = useInsights();
  const [kind, setKind] = useState<string | null>(null);
  const refresh = useAction(() => api.post<{ found: number }>("/api/insights/refresh"), { invalidate: [["insights"], ["dashboard"]] });
  const kinds = [...new Set((data ?? []).map((i) => i.kind))];
  const list = (data ?? []).filter((i) => !kind || i.kind === kind);

  return (
    <>
      <PageIntro
        description="דפוסים שהמערכת מצאה בנתונים שלך — עם כמות הנתונים, רמת הביטחון וההסתייגויות. קשר בין שני דברים לא אומר שאחד גורם לשני."
        actions={
          <Button variant="secondary" size="sm" onClick={() => refresh.mutate(undefined)} loading={refresh.isPending}>
            <RefreshCw className="size-4" /> ניתוח מחדש
          </Button>
        }
      />
      {kinds.length > 1 ? (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={!kind} onClick={() => setKind(null)}>
            הכול
          </Chip>
          {kinds.map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k] ?? k}
            </Chip>
          ))}
        </div>
      ) : null}
      {isLoading && !data ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-[18px]" />
          ))}
        </div>
      ) : error && !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !list.length ? (
        <Card>
          <EmptyState
            icon={<Lightbulb className="size-6" />}
            title="עדיין אין תובנות"
            body="תובנות מופיעות כשיש מספיק ימים להשוואה — בדרך כלל אחרי שבועיים־שלושה של הרגלים וצ׳ק־אין. המערכת לא תציג דפוס בלי מספיק נתונים."
            action={
              <Button variant="secondary" onClick={() => refresh.mutate(undefined)} loading={refresh.isPending}>
                בדוק עכשיו
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {list.map((i) => (
            <InsightCard key={i.id} i={i} />
          ))}
        </div>
      )}
    </>
  );
}
