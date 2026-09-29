"use client";
import { useState } from "react";
import { Database, Download, Info, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/client/api";
import { useDataInventory, useMetrics, useTransactions, type MetricJ } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { openSheet } from "@/client/store";
import { useToday } from "@/client/today";
import { api } from "@/client/api";
import { addDays } from "@/lib/dates";
import { BUILTIN_METRICS, CATEGORY_LABELS, METRIC_MAP, SPENDING_LABEL, type MetricCategory } from "@/lib/metrics";
import { formatCurrency, formatDate, formatMetricValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/field";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { PageIntro } from "@/components/features/insight";
import { sourceLabel } from "@/components/features/timeline-items";
import { TrendChart } from "@/components/charts";

const CATS: (MetricCategory | "finance")[] = ["health", "fitness", "work", "productivity", "learning", "finance", "environment", "other"];

export default function DataPage() {
  const { data: inv, isLoading, error, refetch } = useDataInventory();
  const [cat, setCat] = useState<string>("health");
  const [metric, setMetric] = useState<string | null>(null);
  const [prov, setProv] = useState<string | null>(null);
  if (isLoading && !inv) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (error || !inv) return <ErrorState onRetry={() => refetch()} />;

  const byCat = (c: string) => inv.metrics.filter((m) => (METRIC_MAP.get(m.metricKey)?.category ?? "other") === c);
  const counts = inv.counts;
  const overview = [
    ["הרגלים", counts.habits, `${counts.habitEvents} רשומות היסטוריה`],
    ["מטרות", counts.goals, ""],
    ["צ׳ק־אין", counts.checkins, "ימים"],
    ["יומן", counts.journal, "רשומות"],
    ["הוצאות", counts.transactions, "עסקאות"],
    ["יומן פגישות", counts.calendar, "אירועים"],
    ["זיכרונות", counts.memories, ""],
    ["נתונים מיובאים", counts.importedRecords, "רשומות גולמיות"],
  ] as const;

  return (
    <div className="animate-fade-in">
      <PageIntro
        description="כל מה ש־NOVA יודעת עליך, מסודר לפי נושא. לכל נתון יש מקור: מתי נרשם, מאיפה הגיע ומה היה הערך המקורי."
        actions={
          <a href="/api/export" download>
            <Button variant="secondary" size="sm">
              <Download className="size-4" /> ייצוא הכול
            </Button>
          </a>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        {overview.map(([l, n, sub]) => (
          <Card key={l} className="p-3.5">
            <div className="text-[13px] text-muted">{l}</div>
            <div className="num mt-0.5 text-xl font-semibold">{n.toLocaleString("he-IL")}</div>
            {sub ? <div className="text-[11px] text-faint">{sub}</div> : null}
          </Card>
        ))}
      </div>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {CATS.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {CATEGORY_LABELS[c]}
            {c !== "finance" && byCat(c).length ? <span className="num text-xs text-muted">{byCat(c).length}</span> : null}
          </Chip>
        ))}
      </div>

      {cat === "finance" ? (
        <FinanceSection />
      ) : byCat(cat).length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {byCat(cat).map((m) => {
            const def = METRIC_MAP.get(m.metricKey);
            return (
              <button key={m.metricKey} onClick={() => setMetric(m.metricKey)} className="card p-4 text-start transition-shadow hover:shadow-float">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold">{def?.label ?? m.metricKey}</span>
                  <span className="num text-xs text-muted">{m.n} רשומות</span>
                </div>
                <div className="num mt-1 text-[13px] text-muted">
                  {formatDate(m.first, { short: true })} – {formatDate(m.last, { short: true })} · {m.sources.map(sourceLabel).join(", ")}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<Database className="size-6" />} title={`אין עדיין נתוני ${CATEGORY_LABELS[cat as MetricCategory]}`} body="אפשר להוסיף ידנית או לחבר מקור נתונים אוטומטי." action={<Button variant="secondary" onClick={() => openSheet({ kind: "metric", metricKey: BUILTIN_METRICS.find((b) => b.category === cat && b.input)?.key })}>הוספה ידנית</Button>} />
        </Card>
      )}

      <MetricSheet metricKey={metric} onClose={() => setMetric(null)} onProvenance={setProv} />
      <ProvenanceSheet id={prov} onClose={() => setProv(null)} />
    </div>
  );
}

function MetricSheet({ metricKey, onClose, onProvenance }: { metricKey: string | null; onClose: () => void; onProvenance: (id: string) => void }) {
  const today = useToday();
  const { data } = useMetrics(metricKey ? `keys=${metricKey}&from=${addDays(today, -179)}&limit=1000` : "keys=__none");
  const del = useAction((id: string) => api.del(`/api/metrics/${id}`), { success: "נמחק" });
  const def = metricKey ? METRIC_MAP.get(metricKey) : undefined;
  const rows = (data ?? []) as MetricJ[];
  const series = [...rows].reverse().map((r) => ({ x: r.date, y: r.value }));
  return (
    <Sheet open={Boolean(metricKey)} onOpenChange={(o) => !o && onClose()} title={def?.label ?? metricKey ?? ""} description="חצי השנה האחרונה" size="lg" tall>
      {metricKey ? (
        <>
          <TrendChart points={series} format={def?.format === "minutes" || def?.format === "integer" ? "integer" : def?.format === "hours" ? "hours" : def?.format === "clock" ? "clock" : "decimal"} height={200} label={def?.label} />
          <ul className="mt-4 divide-y divide-line">
            {rows.slice(0, 120).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="num w-20 shrink-0 text-muted">{formatDate(r.date, { short: true })}</span>
                <span className="num min-w-0 flex-1 font-medium">{formatMetricValue(r.metricKey, r.value)}</span>
                <button onClick={() => onProvenance(r.id)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-sunken">
                  <Info className="size-3.5" /> {sourceLabel(r.source)}
                </button>
                {r.source === "manual" ? (
                  <button onClick={() => del.mutate(r.id)} className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:text-negative" aria-label="מחיקה">
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Sheet>
  );
}

function ProvenanceSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["provenance", id],
    queryFn: () => apiGet<{ record: MetricJ; imported: { provider: string; externalId: string; recordType: string; raw: unknown; importedAt: string } | null }>(`/api/metrics/${id}`),
    enabled: Boolean(id),
  });
  const r = data?.record;
  const dt = (s: string | null | undefined) => (s ? new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(s)) : "—");
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()} title="מקור הנתון" size="md">
      {r ? (
        <dl className="space-y-3 text-[15px]">
          {(
            [
              ["ערך", formatMetricValue(r.metricKey, r.value)],
              ["תאריך", formatDate(r.date, { year: true })],
              ["מקור", sourceLabel(r.source)],
              ["נרשם במערכת", dt(r.createdAt)],
              ...(r.startAt ? [["התחלה", dt(r.startAt)]] : []),
              ...(r.endAt ? [["סיום", dt(r.endAt)]] : []),
              ...(r.note ? [["הערה", r.note]] : []),
              ...(data?.imported ? [["יובא ב־", dt(data.imported.importedAt)], ["סוג רשומה", data.imported.recordType]] : []),
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-muted">{k}</dt>
              <dd className="num text-end">{v}</dd>
            </div>
          ))}
          {data?.imported ? (
            <div>
              <dt className="mb-1 text-muted">הרשומה המקורית</dt>
              <dd>
                <pre className="ltr max-h-64 overflow-auto rounded-xl bg-sunken p-3 text-start font-mono text-xs">{JSON.stringify(data.imported.raw, null, 2)}</pre>
              </dd>
            </div>
          ) : null}
          {r.rawValue != null ? (
            <div>
              <dt className="mb-1 text-muted">ערך גולמי לפני עיבוד</dt>
              <dd>
                <pre className="ltr rounded-xl bg-sunken p-3 text-start font-mono text-xs">{JSON.stringify(r.rawValue)}</pre>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
    </Sheet>
  );
}

function FinanceSection() {
  const today = useToday();
  const from = addDays(today, -29);
  const { data: summary } = useQuery({
    queryKey: ["spending-summary", from, today],
    queryFn: () => apiGet<{ category: string; total: number; count: number }[]>(`/api/transactions?summary=1&from=${from}&to=${today}`),
  });
  const { data: tx } = useTransactions(`from=${addDays(today, -89)}&to=${today}`);
  const del = useAction((id: string) => api.del(`/api/transactions/${id}`), { success: "נמחק" });
  const total = (summary ?? []).reduce((s, c) => s + c.total, 0);
  const max = Math.max(...(summary ?? []).map((c) => c.total), 1);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="30 הימים האחרונים" subtitle={`סה״כ ${formatCurrency(total)}`} action={<Button size="sm" variant="subtle" onClick={() => openSheet({ kind: "transaction" })}>הוצאה</Button>} />
        <CardBody className="space-y-3">
          {(summary ?? []).map((c) => (
            <div key={c.category}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{SPENDING_LABEL.get(c.category) ?? c.category}</span>
                <span className="num text-muted">
                  {formatCurrency(c.total)} · {c.count}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(c.total / max) * 100}%` }} />
              </div>
            </div>
          ))}
          {!summary?.length ? <p className="py-4 text-center text-sm text-muted">אין הוצאות בתקופה הזו.</p> : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="עסקאות אחרונות" />
        <CardBody>
          <ul className="divide-y divide-line">
            {(tx ?? []).slice(0, 60).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="num w-16 shrink-0 text-muted">{formatDate(t.date, { short: true })}</span>
                <span className="min-w-0 flex-1 truncate">{t.merchant ?? t.description ?? SPENDING_LABEL.get(t.category)}</span>
                <span className="num shrink-0 font-medium">{formatCurrency(t.amount)}</span>
                <span className={cn("shrink-0 text-xs text-faint")}>{sourceLabel(t.source)}</span>
                {t.source === "manual" ? (
                  <button onClick={() => del.mutate(t.id)} className="grid size-7 shrink-0 place-items-center text-faint hover:text-negative" aria-label="מחיקה">
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
