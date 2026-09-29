"use client";
import { useEffect, useState } from "react";
import { BellOff, BellRing, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/client/api";
import { qk, useNotifications } from "@/client/queries";
import { closeSheet } from "@/client/store";
import { usePush } from "@/client/push";
import { formatRelativeDay } from "@/lib/format";
import { browserToday, cn } from "@/lib/utils";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/misc";

export function NotificationsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useNotifications(open);
  const qc = useQueryClient();
  const push = usePush();
  const [openId, setOpenId] = useState<string | null>(null);
  const today = browserToday();

  useEffect(() => {
    if (open && data?.some((n) => n.status === "sent" && !n.readAt)) {
      void api.post("/api/notifications/read-all").then(() => qc.invalidateQueries({ queryKey: qk.notifications }));
    }
  }, [open, data, qc]);

  const upcoming = (data ?? []).filter((n) => n.status === "pending").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const past = (data ?? []).filter((n) => n.status === "sent" || n.status === "skipped");
  const fmt = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  const Row = ({ n }: { n: (typeof past)[number] }) => {
    const lines = ((n.reason as { lines?: string[] })?.lines ?? []).filter(Boolean);
    const expanded = openId === n.id;
    const day = n.scheduledFor.slice(0, 10);
    return (
      <li className="py-3">
        <button className="flex w-full items-start gap-3 text-start" onClick={() => setOpenId(expanded ? null : n.id)} aria-expanded={expanded}>
          <div className={cn("mt-1 size-2 shrink-0 rounded-full", n.status === "pending" ? "bg-accent" : n.status === "skipped" ? "bg-line-strong" : "bg-ink-2")} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[15px] font-medium">{n.title}</span>
              <span className="num shrink-0 text-xs text-muted">
                {day !== today ? `${formatRelativeDay(day, today)} ` : ""}
                {fmt.format(new Date(n.scheduledFor))}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted">{n.status === "skipped" ? "לא נשלחה" : n.body}</p>
          </div>
          {lines.length ? <ChevronDown className={cn("mt-1 size-4 shrink-0 text-faint transition-transform", expanded && "rotate-180")} /> : null}
        </button>
        {expanded && lines.length ? (
          <div className="me-5 ms-5 mt-2 rounded-xl bg-sunken p-3 text-[13px] leading-relaxed text-ink-2">
            <div className="mb-1 font-medium">למה {n.status === "skipped" ? "לא נשלחה" : "בזמן הזה"}?</div>
            <ul className="list-disc space-y-0.5 ps-4">
              {lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            {n.url ? (
              <Link href={n.url} onClick={() => closeSheet()} className="mt-2 inline-block font-medium text-accent">
                פתח
              </Link>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="התראות ותזכורות" size="md">
      {push.state !== "subscribed" && push.state !== "unsupported" ? (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-accent-soft p-4">
          <BellRing className="size-5 shrink-0 text-accent" />
          <p className="min-w-0 flex-1 text-sm text-ink-2">{push.state === "ios-needs-install" ? "באייפון, התראות עובדות אחרי הוספת NOVA למסך הבית." : "קבל תזכורות חכמות גם כשהאפליקציה סגורה."}</p>
          {push.state === "prompt" ? (
            <Button size="sm" onClick={push.subscribe} loading={push.busy}>
              הפעלה
            </Button>
          ) : null}
        </div>
      ) : null}
      {upcoming.length ? (
        <>
          <h3 className="mt-1 text-[13px] font-semibold text-muted">מתוכנן להיום</h3>
          <ul className="divide-y divide-line">{upcoming.map((n) => <Row key={n.id} n={n} />)}</ul>
        </>
      ) : null}
      <h3 className="mt-4 text-[13px] font-semibold text-muted">לאחרונה</h3>
      {past.length ? <ul className="divide-y divide-line">{past.slice(0, 30).map((n) => <Row key={n.id} n={n} />)}</ul> : <EmptyState icon={<BellOff className="size-6" />} title="אין התראות עדיין" body="תזכורות נשלחות רק כשהן באמת עוזרות — לפי ההרגלים, היומן והשעות השקטות שלך." />}
    </Sheet>
  );
}
