"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/client/api";
import { qk, useDailyBrief } from "@/client/queries";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/misc";

interface BriefNarrative {
  standout?: string;
  attention?: string;
  generated?: "ai" | "rules";
}

/** "What stands out today" + "one thing worth paying attention to". */
export function DailyBrief({ date, aiConfigured }: { date: string; aiConfigured: boolean }) {
  const { data, isLoading } = useDailyBrief(date);
  const qc = useQueryClient();
  const asked = useRef(false);

  useEffect(() => {
    if (!data || data.narrative || asked.current) return;
    asked.current = true;
    void api.post("/api/reports/daily/narrate", { date }).then(() => qc.invalidateQueries({ queryKey: qk.brief(date) })).catch(() => {});
  }, [data, date, qc]);

  const n = (data?.narrative ?? null) as BriefNarrative | null;
  const items = ((data?.facts as { items?: { id: string; text: string }[] } | undefined)?.items ?? []).length;

  if (isLoading) return <Skeleton className="h-28 w-full rounded-[18px]" />;
  if (!data || items === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-4 md:px-5 md:pt-5">
        <div className="text-xs font-medium text-accent">סיכום יומי</div>
      </div>
      {n ? (
        <div className="space-y-3 px-4 pb-4 pt-2 md:px-5 md:pb-5">
          {n.standout ? <p className="text-[16px] leading-relaxed">{n.standout}</p> : null}
          {n.attention ? (
            <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
              <div className="text-xs font-medium text-muted">ששווה לשים לב</div>
              <p className="mt-0.5 text-[15px] leading-relaxed">{n.attention}</p>
            </div>
          ) : null}
          {n.generated === "rules" && aiConfigured ? <p className="text-[11px] text-faint">נוסח אוטומטית מהנתונים (ה־AI לא היה זמין).</p> : null}
        </div>
      ) : (
        <div className="space-y-2 px-4 pb-4 pt-3 md:px-5 md:pb-5">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-8/12" />
        </div>
      )}
    </Card>
  );
}
