"use client";
/**
 * Charts. RTL convention: time flows right → left (mirrored x-axis, y-axis on the right),
 * matching the reading direction. Charts render inside dir="ltr" containers so the SVG
 * geometry is predictable; all text (ticks, tooltips) is Hebrew-formatted.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FieldFormat } from "@/lib/frame-fields";
import { formatFieldValue } from "@/lib/frame-fields";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Point {
  x: string;
  y: number | null;
}

const fmt = (format: FieldFormat) => (v: number | null | undefined) => formatFieldValue({ key: "", label: "", phrase: "", format, higherIsBetter: null, group: "other" }, v ?? null);

function axisTick(format: FieldFormat) {
  return (v: number) => {
    if (format === "percent" || format === "binary") return `${Math.round(v * 100)}%`;
    if (format === "currency") return `₪${Math.round(v)}`;
    if (format === "hours") return `${Math.round(v * 10) / 10}`;
    if (format === "clock") return fmt("clock")(v);
    return v >= 1000 ? `${Math.round(v / 100) / 10}K` : `${Math.round(v * 10) / 10}`;
  };
}

function ChartTooltip({ active, payload, format, label }: { active?: boolean; payload?: { value: number | null; payload: Point }[]; format: FieldFormat; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div dir="rtl" className="rounded-xl bg-ink px-3 py-2 text-xs text-bg shadow-float">
      <div className="opacity-70">{/^\d{4}-\d{2}-\d{2}$/.test(p.payload.x) ? formatDate(p.payload.x, { short: true }) : p.payload.x}</div>
      <div className="num mt-0.5 text-sm font-semibold">{p.value == null ? "אין נתון" : fmt(format)(p.value)}</div>
      {label ? <div className="opacity-70">{label}</div> : null}
    </div>
  );
}

export function Sparkline({ points, format, className, height = 40 }: { points: Point[]; format: FieldFormat; className?: string; height?: number }) {
  const has = points.filter((p) => p.y != null).length >= 2;
  if (!has) return <div className={cn("grid place-items-center text-[11px] text-faint", className)} style={{ height }}>אין מספיק נתונים</div>;
  return (
    <div dir="ltr" className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="x" hide reversed />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="y" stroke="var(--accent)" strokeWidth={2} fill="url(#spark-fill)" connectNulls dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({
  points,
  format,
  kind = "line",
  height = 220,
  reference,
  className,
  label,
}: {
  points: Point[];
  format: FieldFormat;
  kind?: "line" | "bar";
  height?: number;
  reference?: { y: number; label: string } | null;
  className?: string;
  label?: string;
}) {
  const valid = points.filter((p) => p.y != null);
  if (valid.length < 2) {
    return <div className={cn("grid place-items-center rounded-xl bg-sunken text-sm text-muted", className)} style={{ height }}>עדיין אין מספיק נתונים לגרף</div>;
  }
  const tickX = (x: string) => (/^\d{4}-\d{2}-\d{2}$/.test(x) ? `${Number(x.slice(8, 10))}/${Number(x.slice(5, 7))}` : x);
  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--grid)" />
      <XAxis dataKey="x" reversed tickFormatter={tickX} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={24} />
      <YAxis orientation="right" width={40} tickFormatter={axisTick(format)} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} domain={format === "score" ? [1, 10] : format === "percent" || format === "binary" ? [0, 1] : ["auto", "auto"]} />
      <Tooltip content={<ChartTooltip format={format} label={label} />} cursor={kind === "bar" ? { fill: "var(--bg-sunken)" } : { stroke: "var(--line-strong)", strokeWidth: 1 }} />
      {reference ? <ReferenceLine y={reference.y} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: reference.label, position: "insideTopRight", fontSize: 11, fill: "var(--muted)" }} /> : null}
    </>
  );
  return (
    <div dir="ltr" className={className} style={{ height }} role="img" aria-label={label ? `גרף: ${label}` : "גרף"}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 4 }} barCategoryGap={2}>
            {common}
            <Bar dataKey="y" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 4 }}>
            {common}
            <Line type="monotone" dataKey="y" stroke="var(--accent)" strokeWidth={2} connectNulls dot={points.length <= 20 ? { r: 3, fill: "var(--accent)", strokeWidth: 0 } : false} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Two-or-more group comparison as labelled horizontal bars (evidence view). */
export function CompareBars({ groups, className }: { groups: { label: string; n: number; mean: string; raw: number | null }[]; className?: string }) {
  const max = Math.max(...groups.map((g) => Math.abs(g.raw ?? 0)), 1e-9);
  const colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
  return (
    <div className={cn("space-y-3", className)}>
      {groups.map((g, i) => (
        <div key={g.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-2">{g.label}</span>
            <span className="num shrink-0 font-semibold">{g.mean}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full" style={{ width: `${Math.max(3, (Math.abs(g.raw ?? 0) / max) * 100)}%`, background: colors[i % colors.length] }} />
            </div>
            <span className="num w-14 shrink-0 text-end text-xs text-muted">{g.n} ימים</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const cellTone: Record<string, string> = {
  completed: "bg-accent",
  partial: "bg-accent/45",
  missed: "bg-negative/25",
  skipped: "bg-line-strong",
  none: "bg-sunken",
  off: "bg-transparent border border-dashed border-line",
};

/** Habit calendar: columns are weeks (newest on the left, RTL), rows are Sunday–Saturday. */
export function HabitHeatmap({ days, weeks = 26, today }: { days: { date: string; status: string | null; scheduled: boolean }[]; weeks?: number; today: string }) {
  const map = new Map(days.map((d) => [d.date, d]));
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - end.getUTCDay() - (weeks - 1) * 7);
  const cols: { date: string; status: string; label: string }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setUTCDate(start.getUTCDate() + w * 7 + d);
      const iso = dt.toISOString().slice(0, 10);
      const info = map.get(iso);
      const status = iso > today ? "future" : info?.status ?? (info?.scheduled === false ? "off" : "none");
      col.push({ date: iso, status, label: `${formatDate(iso, { short: true })}: ${{ completed: "בוצע", partial: "חלקי", missed: "לא בוצע", skipped: "דולג", none: "אין נתון", off: "לא מתוכנן", future: "" }[status] ?? ""}` });
    }
    cols.push(col);
  }
  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="flex gap-[3px]" role="img" aria-label="לוח השלמה של ההרגל">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((c) => (
              <div key={c.date} title={c.label} className={cn("size-3.5 rounded-[4px]", c.status === "future" ? "bg-transparent" : cellTone[c.status] ?? "bg-sunken")} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        {[
          ["completed", "בוצע"],
          ["partial", "חלקי"],
          ["missed", "לא בוצע"],
          ["skipped", "דולג"],
          ["off", "לא מתוכנן"],
        ].map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("size-2.5 rounded-[3px]", cellTone[k])} /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}
