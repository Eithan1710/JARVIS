"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/misc";
import { CompareBars, TrendChart } from "../charts";
import type { FieldFormat } from "@/lib/frame-fields";

export const KIND_LABEL: Record<string, string> = {
  correlation: "קשר בין נתונים",
  change: "שינוי",
  trend: "מגמה",
  pattern: "דפוס",
  streak: "רצף",
  anomaly: "חריגה",
  hypothesis: "השערה",
};

export const EVIDENCE_LABEL: Record<string, { label: string; hint: string }> = {
  observation: { label: "תצפית", hint: "משהו שנמדד בנתונים — בלי הסבר למה." },
  correlation: { label: "מתאם", hint: "שני דברים נוטים להופיע יחד. לא בהכרח אחד גורם לשני." },
  temporal_association: { label: "קשר בזמן", hint: "הגורם קדם לתוצאה בזמן, אבל זה עדיין לא מוכיח סיבה." },
  hypothesis: { label: "השערה", hint: "הסבר אפשרי שעוד צריך לבדוק." },
  stronger_evidence: { label: "ראיה חזקה יותר", hint: "נבדק בניסוי או חוזר בעקביות לאורך זמן." },
};

export function ConfidenceBadge({ level }: { level: string | null | undefined }) {
  if (!level) return null;
  const map: Record<string, { tone: "positive" | "warning" | "neutral"; label: string; dots: number }> = {
    high: { tone: "positive", label: "ביטחון גבוה", dots: 3 },
    medium: { tone: "warning", label: "ביטחון בינוני", dots: 2 },
    low: { tone: "neutral", label: "ביטחון נמוך", dots: 1 },
  };
  const m = map[level] ?? map.low;
  return (
    <Badge tone={m.tone}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("size-1.5 rounded-full", i <= m.dots ? "bg-current" : "bg-current opacity-25")} />
        ))}
      </span>
      {m.label}
    </Badge>
  );
}

export interface InsightLite {
  id: string;
  title: string;
  summary: string;
  kind: string;
  confidence: string | null;
  evidenceLevel: string;
  status?: string;
}

export function InsightCard({ i, compact }: { i: InsightLite; compact?: boolean }) {
  return (
    <Link href={`/insights/${i.id}`} className={cn("card group block transition-shadow hover:shadow-float", compact ? "p-4" : "p-4 md:p-5")}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-accent">{KIND_LABEL[i.kind] ?? "תובנה"}</span>
        {i.status === "new" ? <span className="size-1.5 rounded-full bg-accent" aria-label="חדש" /> : null}
        {i.status === "pinned" ? <span className="text-xs text-muted">· נעוץ</span> : null}
      </div>
      <h3 className="text-[16px] font-semibold leading-snug">{i.title}</h3>
      <p className={cn("mt-1.5 text-[14px] leading-relaxed text-ink-2", compact && "line-clamp-3")}>{i.summary}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <ConfidenceBadge level={i.confidence} />
          <Badge>{EVIDENCE_LABEL[i.evidenceLevel]?.label ?? "תצפית"}</Badge>
        </div>
        <span className="flex shrink-0 items-center text-xs font-medium text-muted group-hover:text-accent">
          ראיות
          <ChevronLeft className="size-4" />
        </span>
      </div>
    </Link>
  );
}

type Block = { kind: string; label: string; data: Record<string, unknown> };

/** Renders analytics evidence blocks. Shared by Insights, Ask AI and experiments. */
export function Evidence({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((b, idx) => (
        <div key={idx}>
          <h4 className="mb-2.5 text-[13px] font-semibold text-muted">{b.label}</h4>
          <EvidenceBlock b={b} />
        </div>
      ))}
    </div>
  );
}

function EvidenceBlock({ b }: { b: Block }) {
  switch (b.kind) {
    case "comparison": {
      const d = b.data as { groups: { label: string; n: number; mean: string; raw: number | null }[]; difference: string };
      return (
        <div>
          <CompareBars groups={d.groups} />
          <p className="num mt-2 text-sm text-muted">הפרש: {d.difference}</p>
        </div>
      );
    }
    case "series": {
      const d = b.data as { format: FieldFormat; points: { x: string; y: number | null }[] };
      return <TrendChart points={d.points} format={d.format} height={180} kind={d.points.length <= 16 && d.format !== "score" ? "bar" : "line"} label={b.label} />;
    }
    case "table": {
      const d = b.data as { columns: string[]; rows: string[][] };
      return (
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                {d.columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-start font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={cn("num px-3 py-2", j === 0 ? "text-ink" : "text-ink-2")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "criteria": {
      const d = b.data as { items: string[] };
      return (
        <ul className="space-y-1.5 text-sm leading-relaxed text-ink-2">
          {d.items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-faint" />
              <span className="bidi">{t}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "stat": {
      const d = b.data as { items: { label: string; value: string }[] };
      return (
        <dl className="grid grid-cols-2 gap-3">
          {d.items.map((it) => (
            <div key={it.label} className="rounded-xl bg-sunken p-3">
              <dt className="text-xs text-muted">{it.label}</dt>
              <dd className="num mt-1 font-semibold">{it.value}</dd>
            </div>
          ))}
        </dl>
      );
    }
    default:
      return null;
  }
}

export function PageIntro({ description, actions, className }: { description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  if (!description && !actions) return null;
  return (
    <div className={cn("mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-6", className)}>
      {description ? <p className="max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p> : <span />}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
