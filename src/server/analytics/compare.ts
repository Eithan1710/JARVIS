/**
 * Higher-level deterministic analyses over a Day Frame. Each returns numbers plus
 * ready-to-render evidence blocks, so both the Insights UI and the AI context use the
 * exact same computed facts.
 */
import { addDays, diffDays, type ISODate } from "@/lib/dates";
import { aggregateNoun, fieldInfo, formatFieldValue, type FieldInfo } from "@/lib/frame-fields";
import { formatRange, WEEKDAY_NAMES } from "@/lib/format";
import { assessConfidence, type ConfidenceResult } from "./confidence";
import { column, weeklyMeans, type DayRow } from "./dayframe";
import { compareGroups, linearTrend, mean, median, round, spearman, summarize, type GroupComparison } from "./stats";

export type FieldLookup = (key: string) => FieldInfo;

export function makeLookup(habitNames?: Map<string, string>, custom?: Map<string, { label: string; unit: string | null }>): FieldLookup {
  return (key) => fieldInfo(key, habitNames, custom);
}

/* ------------------------------------------------------------------ */
/* Evidence blocks (rendered by the UI's <Evidence> component)          */
/* ------------------------------------------------------------------ */

export type EvidenceBlock =
  | { kind: "comparison"; label: string; data: { metric: string; groups: { label: string; n: number; mean: string; median: string; raw: number | null }[]; difference: string } }
  | { kind: "series"; label: string; data: { format: FieldInfo["format"]; points: { x: string; y: number | null }[]; unit?: string } }
  | { kind: "stat"; label: string; data: { items: { label: string; value: string }[] } }
  | { kind: "table"; label: string; data: { columns: string[]; rows: string[][] } }
  | { kind: "criteria"; label: string; data: { items: string[] } };

/* ------------------------------------------------------------------ */
/* Condition comparison                                                 */
/* ------------------------------------------------------------------ */

export interface Condition {
  key: string;
  /** binary: value >= 0.5 ; threshold: value >= threshold ; median: split at the median */
  mode: "binary" | "threshold" | "median";
  threshold?: number;
  /** 1 = factor from the previous day (factor precedes outcome). */
  lag: number;
}

export interface ConditionResult {
  condition: Condition;
  outcomeKey: string;
  cutoff: number | null;
  labels: [string, string];
  comparison: GroupComparison;
  confidence: ConfidenceResult;
  weekendShare: [number, number];
  /** Other signals that also differed strongly between the groups. */
  confounders: { key: string; label: string; a: string; b: string; d: number }[];
  n: number;
  groupDates: [ISODate[], ISODate[]];
}

function conditionLabels(info: FieldInfo, cond: Condition, cutoff: number | null): [string, string] {
  const prev = cond.lag === 1;
  if (info.key === "isWeekend") return ["בסופי שבוע", "בימי חול"];
  if (cond.mode === "binary" || info.format === "binary") {
    if (info.key === "exercised") return prev ? ["ביום שאחרי אימון", "ביום שאחרי יום בלי אימון"] : ["בימים עם אימון", "בימים בלי אימון"];
    if (info.key.startsWith("habit:")) return prev ? [`ביום שאחרי „${info.label}”`, "ביום שאחרי יום בלעדיו"] : [`בימים שבהם השלמת „${info.label}”`, "בימים שלא"];
    return prev ? [`ביום שאחרי „${info.label}”`, "בשאר הימים"] : [`בימים עם „${info.label}”`, "בשאר הימים"];
  }
  const c = cutoff == null ? "" : formatFieldValue(info, cutoff);
  const pre = prev ? "ביום שאחרי יום עם" : "בימים עם";
  switch (info.key) {
    case "sleep_hours":
      return prev ? [`יומיים אחרי לילה של ${c} ומעלה`, "יומיים אחרי לילה קצר יותר"] : [`בימים שאחרי לילה של ${c} שינה ומעלה`, "בימים שאחרי לילה קצר יותר"];
    case "bedtime":
      return [`כשנרדמת ב־${c} או מאוחר יותר`, `כשנרדמת לפני ${c}`];
    case "meetings":
      return [`${pre} ${c} פגישות ומעלה`, "בימים עם פחות פגישות"];
    case "steps":
      return [`${pre} ${c} צעדים ומעלה`, "בימים עם פחות צעדים"];
    case "work_hours":
      return [`${pre} ${c} עבודה ומעלה`, "בימים עם פחות שעות עבודה"];
    case "calendar_hours":
      return [`${pre} ${c} ומעלה של אירועים ביומן`, "בימים עם יומן פנוי יותר"];
    case "screen_time_hours":
      return [`${pre} ${c} זמן מסך ומעלה`, "בימים עם פחות זמן מסך"];
    case "spending":
      return [`${pre} הוצאות של ${c} ומעלה`, "בימים עם פחות הוצאות"];
    default:
      return [`${pre} ${info.label} של ${c} ומעלה`, "בשאר הימים"];
  }
}

/** Round a median split point to a human-friendly value (15-min clock, round step counts, etc.). */
export function niceCutoff(format: FieldInfo["format"], v: number): number {
  switch (format) {
    case "clock":
      return Math.round(v / 15) * 15;
    case "hours":
      return Math.round(v * 2) / 2 || 0.5;
    case "score":
      return Math.round(v);
    case "currency":
      return v >= 200 ? Math.round(v / 50) * 50 : Math.round(v / 10) * 10;
    case "integer":
      return v >= 5000 ? Math.round(v / 500) * 500 : v >= 100 ? Math.round(v / 10) * 10 : Math.max(1, Math.round(v));
    case "minutes":
      return Math.round(v / 5) * 5;
    default:
      return Math.round(v * 10) / 10;
  }
}

export function compareCondition(
  frame: DayRow[],
  cond: Condition,
  outcomeKey: string,
  lookup: FieldLookup,
  confounderKeys: string[] = [],
): ConditionResult | null {
  const factor = column(frame, cond.key, cond.lag);
  const outcome = column(frame, outcomeKey);
  const vals = factor.filter((x): x is number => x != null);
  if (vals.length < 6) return null;
  let cutoff: number | null = null;
  if (cond.mode === "threshold") cutoff = cond.threshold ?? null;
  else if (cond.mode === "median") {
    const m = median(vals);
    cutoff = m == null ? null : niceCutoff(lookup(cond.key).format, m);
  }
  const isHi = (x: number) => (cond.mode === "binary" ? x >= 0.5 : x >= (cutoff ?? 0));
  if (cond.mode !== "binary" && cutoff == null) return null;

  const a: number[] = [];
  const b: number[] = [];
  const aIdx: number[] = [];
  const bIdx: number[] = [];
  frame.forEach((_, i) => {
    const f = factor[i];
    const o = outcome[i];
    if (f == null || o == null) return;
    if (isHi(f)) {
      a.push(o);
      aIdx.push(i);
    } else {
      b.push(o);
      bIdx.push(i);
    }
  });
  const n = a.length + b.length;
  if (a.length < 3 || b.length < 3) return null;

  const factorInfo = lookup(cond.key);
  const labels = conditionLabels(factorInfo, cond, cutoff);
  const comparison = compareGroups(a, b);
  let confidence = assessConfidence({
    n,
    groups: [a.length, b.length],
    effect: comparison.d,
    effectType: "d",
    groupLabels: [shortLabel(labels[0]), shortLabel(labels[1])],
  });
  const wk = (idx: number[]) => (idx.length ? idx.filter((i) => frame[i].isWeekend).length / idx.length : 0);
  // When the two groups are dominated by different day types, the comparison is mostly weekday vs
  // weekend — lower the confidence one notch and say why.
  if (cond.key !== "isWeekend" && Math.abs(wk(aIdx) - wk(bIdx)) > 0.3 && (confidence.level === "high" || confidence.level === "medium")) {
    confidence.level = confidence.level === "high" ? "medium" : "low";
    confidence.reason = `${confidence.level === "medium" ? "ביטחון בינוני" : "ביטחון נמוך"} — מבוסס על ${n} ימים, אבל חלק גדול מההבדל עשוי לנבוע מההבדל בין ימי חול לסופי שבוע.`;
  }

  const confounders: ConditionResult["confounders"] = [];
  for (const ck of confounderKeys) {
    if (ck === cond.key || ck === outcomeKey) continue;
    const col = column(frame, ck);
    const ca = aIdx.map((i) => col[i]);
    const cb = bIdx.map((i) => col[i]);
    const cmp = compareGroups(ca, cb);
    if (cmp.d != null && Math.abs(cmp.d) >= 0.6 && cmp.a.n >= 3 && cmp.b.n >= 3) {
      const info = lookup(ck);
      confounders.push({ key: ck, label: info.label, a: formatFieldValue(info, cmp.a.mean), b: formatFieldValue(info, cmp.b.mean), d: cmp.d });
    }
  }

  return {
    condition: cond,
    outcomeKey,
    cutoff,
    labels,
    comparison,
    confidence,
    weekendShare: [wk(aIdx), wk(bIdx)],
    confounders: confounders.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3),
    n,
    groupDates: [aIdx.map((i) => frame[i].date), bIdx.map((i) => frame[i].date)],
  };
}

function shortLabel(s: string) {
  return s.replace(/^ב/, "");
}

export function conditionEvidence(r: ConditionResult, lookup: FieldLookup, period: [ISODate, ISODate]): EvidenceBlock[] {
  const out = lookup(r.outcomeKey);
  const factor = lookup(r.condition.key);
  const blocks: EvidenceBlock[] = [
    {
      kind: "comparison",
      label: `${aggregateNoun(out)} בשתי הקבוצות`,
      data: {
        metric: out.label,
        groups: [
          { label: r.labels[0], n: r.comparison.a.n, mean: formatFieldValue(out, r.comparison.a.mean), median: formatFieldValue(out, r.comparison.a.median), raw: r.comparison.a.mean },
          { label: r.labels[1], n: r.comparison.b.n, mean: formatFieldValue(out, r.comparison.b.mean), median: formatFieldValue(out, r.comparison.b.median), raw: r.comparison.b.mean },
        ],
        difference: diffText(out, r.comparison),
      },
    },
    {
      kind: "criteria",
      label: "איך חושב",
      data: {
        items: [
          `תקופה: ${formatRange(period[0], period[1])} (${diffDays(period[1], period[0]) + 1} ימים).`,
          `נכללו רק ימים שבהם היו נתונים גם על ${factor.label} וגם על ${out.label} — ${r.n} ימים.`,
          r.condition.mode === "binary"
            ? `חלוקה לפי ${factor.label}: כן / לא.`
            : r.condition.mode === "threshold"
              ? `חלוקה לפי סף קבוע: ${formatFieldValue(factor, r.cutoff)}.`
              : `חלוקה לפי החציון של ${factor.label}: ${formatFieldValue(factor, r.cutoff)}.`,
          r.condition.lag === 1 ? `${factor.label} נמדד ביום הקודם — כלומר קודם בזמן לתוצאה.` : `שני הנתונים מאותו יום.`,
          `גודל אפקט (Cohen's d): ${r.comparison.d?.toFixed(2) ?? "—"}.`,
        ],
      },
    },
  ];
  if (r.confounders.length) {
    blocks.push({
      kind: "table",
      label: "דברים נוספים שהיו שונים בין הקבוצות",
      data: { columns: ["נתון", r.labels[0], r.labels[1]], rows: r.confounders.map((c) => [c.label, c.a, c.b]) },
    });
  }
  return blocks;
}

export function diffText(info: FieldInfo, cmp: GroupComparison): string {
  if (cmp.diff == null) return "—";
  if (formatFieldValue(info, Math.abs(cmp.diff)) === formatFieldValue(info, 0)) return "ללא הבדל";
  const sign = cmp.diff > 0 ? "+" : "−";
  const abs = Math.abs(cmp.diff);
  if (info.format === "percent" || info.format === "binary") return `${sign}${Math.round(abs * 100)} נק׳ אחוז`;
  if (info.format === "score") return `${sign}${round(abs, 1)} נק׳`;
  return `${sign}${formatFieldValue(info, abs)}`;
}

export function conditionCaveats(r: ConditionResult): string[] {
  const c: string[] = [];
  c.push(r.condition.lag === 1 ? "הגורם קדם לתוצאה בזמן, אבל זה עדיין לא מוכיח סיבה ותוצאה." : "זהו מתאם — לא בהכרח סיבה ותוצאה. ייתכן שהקשר הפוך, או שגורם שלישי משפיע על שניהם.");
  if (Math.abs(r.weekendShare[0] - r.weekendShare[1]) > 0.25)
    c.push(`חלק שונה מהימים בכל קבוצה הם סופי שבוע (${Math.round(r.weekendShare[0] * 100)}% לעומת ${Math.round(r.weekendShare[1] * 100)}%), וזה עשוי להסביר חלק מההבדל.`);
  for (const cf of r.confounders.slice(0, 2)) c.push(`באותם ימים נמדד גם הבדל ב${cf.label} (${cf.a} לעומת ${cf.b}) — ייתכן שזה חלק מההסבר.`);
  return c;
}

/* ------------------------------------------------------------------ */
/* Correlation                                                          */
/* ------------------------------------------------------------------ */

export function correlate(frame: DayRow[], xKey: string, yKey: string, lag = 0) {
  const x = column(frame, xKey, lag);
  const y = column(frame, yKey);
  const { r, n } = spearman(x, y);
  return { r: round(r, 2), n, confidence: assessConfidence({ n, effect: r, effectType: "r" }) };
}

/* ------------------------------------------------------------------ */
/* Period comparison & trend                                            */
/* ------------------------------------------------------------------ */

export interface PeriodResult {
  key: string;
  a: { from: ISODate; to: ISODate };
  b: { from: ISODate; to: ISODate };
  comparison: GroupComparison;
  confidence: ConfidenceResult;
}

export function comparePeriods(frame: DayRow[], key: string, a: { from: ISODate; to: ISODate }, b: { from: ISODate; to: ISODate }): PeriodResult {
  const inRange = (r: DayRow, p: { from: ISODate; to: ISODate }) => r.date >= p.from && r.date <= p.to;
  const va = frame.filter((r) => inRange(r, a)).map((r) => r.v[key] ?? null);
  const vb = frame.filter((r) => inRange(r, b)).map((r) => r.v[key] ?? null);
  const comparison = compareGroups(va, vb);
  const confidence = assessConfidence({ n: comparison.a.n + comparison.b.n, groups: [comparison.a.n, comparison.b.n], effect: comparison.d, effectType: "d" });
  return { key, a, b, comparison, confidence };
}

export function trend(frame: DayRow[], key: string) {
  const weeks = weeklyMeans(frame, [key]).filter((w) => w.days >= 4);
  const series = weeks.map((w) => w.values[key]);
  const t = linearTrend(series);
  return { weeks: weeks.map((w) => ({ weekStart: w.weekStart, value: round(w.values[key], 3) })), slopePerWeek: round(t.slope, 3), r2: round(t.r2, 2), n: t.n };
}

export function seriesEvidence(frame: DayRow[], key: string, info: FieldInfo, label?: string, weekly = false): EvidenceBlock {
  if (weekly) {
    const w = weeklyMeans(frame, [key]);
    return { kind: "series", label: label ?? `${info.label} — ממוצע שבועי`, data: { format: info.format, points: w.map((x) => ({ x: x.weekStart, y: round(x.values[key], 3) })) } };
  }
  return { kind: "series", label: label ?? info.label, data: { format: info.format, points: frame.map((r) => ({ x: r.date, y: r.v[key] ?? null })) } };
}

/* ------------------------------------------------------------------ */
/* Day-of-week                                                          */
/* ------------------------------------------------------------------ */

export function dayOfWeek(frame: DayRow[], key: string) {
  return [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const vals = frame.filter((r) => r.weekday === wd).map((r) => r.v[key] ?? null);
    const s = summarize(vals);
    return { weekday: wd, name: WEEKDAY_NAMES[wd], n: s.n, mean: s.mean };
  });
}

/* ------------------------------------------------------------------ */
/* Snapshot for AI context                                              */
/* ------------------------------------------------------------------ */

/** Compact numeric summary of a key over the frame, split into halves for "what changed". */
export function keySnapshot(frame: DayRow[], key: string, lookup: FieldLookup) {
  const info = lookup(key);
  const vals = column(frame, key);
  const s = summarize(vals);
  if (!s.n) return null;
  const half = Math.floor(frame.length / 2);
  const first = mean(vals.slice(0, half));
  const second = mean(vals.slice(half));
  return {
    key,
    label: info.label,
    n: s.n,
    mean: formatFieldValue(info, s.mean),
    median: formatFieldValue(info, s.median),
    min: formatFieldValue(info, s.min),
    max: formatFieldValue(info, s.max),
    firstHalfMean: formatFieldValue(info, first),
    secondHalfMean: formatFieldValue(info, second),
    raw: { mean: s.mean, first: round(first, 3), second: round(second, 3) },
  };
}

export function lastNDays(frame: DayRow[], today: ISODate, n: number) {
  const from = addDays(today, -(n - 1));
  return frame.filter((r) => r.date >= from && r.date <= today);
}
