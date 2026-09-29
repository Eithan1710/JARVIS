/**
 * Automatic insight discovery — fully deterministic. Scans a curated set of factor→outcome
 * pairs, period changes, weekday patterns and habit consistency shifts, keeps only findings
 * with enough data and a meaningful effect, and writes careful Hebrew text for them.
 *
 * The AI is not involved here; it may later *narrate* or *question* these findings, but it
 * never invents them.
 */
import { addDays, type ISODate } from "@/lib/dates";
import { aggregateNoun, formatFieldValue } from "@/lib/frame-fields";
import { WEEKDAY_NAMES } from "@/lib/format";
import { assessConfidence, type ConfidenceLevel } from "./confidence";
import {
  compareCondition,
  comparePeriods,
  conditionCaveats,
  conditionEvidence,
  dayOfWeek,
  diffText,
  seriesEvidence,
  type Condition,
  type EvidenceBlock,
  type FieldLookup,
} from "./compare";
import { changePoint, describeEffect, round } from "./stats";
import { column, coverage, type DayRow } from "./dayframe";
import type { EvidenceLevel } from "../db/schema";

export interface InsightDraft {
  fingerprint: string;
  kind: "correlation" | "trend" | "change" | "pattern" | "streak";
  evidenceLevel: EvidenceLevel;
  title: string;
  summary: string;
  body?: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  sampleSize: number;
  confidence: Exclude<ConfidenceLevel, "insufficient">;
  confidenceReason: string;
  caveats: string[];
  score: number;
  evidence: EvidenceBlock[];
  data: Record<string, unknown>;
}

interface FactorSpec {
  key: string;
  mode: Condition["mode"];
  threshold?: number;
  lags: number[];
}

const OUTCOMES = ["mood", "energy", "focus", "habit_rate", "main_habit_rate", "exercised", "deep_work_hours"];

const CORE_FACTORS: FactorSpec[] = [
  { key: "sleep_hours", mode: "threshold", threshold: 7, lags: [0] },
  { key: "bedtime", mode: "median", lags: [0] },
  { key: "exercised", mode: "binary", lags: [0, 1] },
  { key: "meetings", mode: "median", lags: [0] },
  { key: "calendar_hours", mode: "median", lags: [0] },
  { key: "work_hours", mode: "median", lags: [0, 1] },
  { key: "steps", mode: "median", lags: [0] },
  { key: "screen_time_hours", mode: "median", lags: [0] },
  { key: "spending", mode: "median", lags: [0] },
];

/** Pairs that are trivially related (same underlying signal) are skipped. */
function trivial(factor: string, outcome: string, linkedMetrics: Set<string>): boolean {
  if (factor === outcome) return true;
  // A metric that auto-completes a habit is part of the habit rate by construction.
  if (linkedMetrics.has(factor) && (outcome === "habit_rate" || outcome === "main_habit_rate" || outcome === "side_habit_rate")) return true;
  if (factor === "exercised" && (outcome === "habit_rate" || outcome === "main_habit_rate")) return true;
  if (factor.startsWith("habit:") && (outcome === "habit_rate" || outcome === "main_habit_rate" || outcome === "exercised")) return true;
  if (factor === "meetings" && outcome === "calendar_hours") return true;
  return false;
}

const CONFOUNDERS = ["sleep_hours", "exercised", "meetings", "work_hours", "steps"];

const confWeight: Record<string, number> = { high: 1, medium: 0.75, low: 0.4 };

export function discoverInsights(frame: DayRow[], lookup: FieldLookup, opts: { mainHabitIds: string[]; today: ISODate; linkedMetrics?: string[] }): InsightDraft[] {
  if (frame.length < 10) return [];
  const period: [ISODate, ISODate] = [frame[0].date, frame[frame.length - 1].date];
  const linked = new Set(opts.linkedMetrics ?? []);
  const drafts: InsightDraft[] = [];

  /* 1. Factor → outcome comparisons */
  const factors: FactorSpec[] = [
    ...CORE_FACTORS,
    ...opts.mainHabitIds.map((id) => ({ key: `habit:${id}`, mode: "binary" as const, lags: [0, 1] })),
  ];
  for (const f of factors) {
    if (coverage(frame, f.key) < 8) continue;
    for (const outcome of OUTCOMES) {
      if (trivial(f.key, outcome, linked) || coverage(frame, outcome) < 8) continue;
      for (const lag of f.lags) {
        if (lag === 1 && !["mood", "energy", "focus", "exercised", "main_habit_rate"].includes(outcome)) continue;
        const r = compareCondition(frame, { key: f.key, mode: f.mode, threshold: f.threshold, lag }, outcome, lookup, CONFOUNDERS);
        if (!r || r.confidence.level === "insufficient" || r.comparison.d == null) continue;
        const effect = describeEffect(r.comparison.d);
        if (effect === "none" || (effect === "small" && r.confidence.level === "low")) continue;
        const outInfo = lookup(outcome);
        const factorInfo = lookup(f.key);
        // Skip differences that are numerically meaningless even if "significant".
        if (outInfo.format === "score" && Math.abs(r.comparison.diff ?? 0) < 0.4) continue;
        if ((outInfo.format === "percent" || outInfo.format === "binary") && Math.abs(r.comparison.diff ?? 0) < 0.08) continue;

        const higher = (r.comparison.diff ?? 0) > 0;
        const noun = aggregateNoun(outInfo);
        const title = `${factorInfo.label} ו${outInfo.label}`;
        const summary =
          `${r.labels[0]}, ${noun} היה ${formatFieldValue(outInfo, r.comparison.a.mean)} — לעומת ${formatFieldValue(outInfo, r.comparison.b.mean)} ${r.labels[1]}.`;
        const body =
          (lag === 1 ? `${factorInfo.label} נמדד יום לפני התוצאה. ` : "") +
          `ההפרש בין הקבוצות: ${diffText(outInfo, r.comparison)}. זו תצפית על הנתונים שלך בתקופה הזו — קשר, לא בהכרח סיבה ותוצאה.`;
        const score = Math.abs(r.comparison.d) * Math.sqrt(Math.min(r.comparison.a.n, r.comparison.b.n)) * confWeight[r.confidence.level];
        drafts.push({
          fingerprint: `cond:${f.key}:${lag}→${outcome}`,
          kind: "correlation",
          evidenceLevel: lag === 1 ? "temporal_association" : "correlation",
          title,
          summary,
          body,
          periodStart: period[0],
          periodEnd: period[1],
          sampleSize: r.n,
          confidence: r.confidence.level as InsightDraft["confidence"],
          confidenceReason: r.confidence.reason,
          caveats: conditionCaveats(r),
          score,
          evidence: conditionEvidence(r, lookup, period),
          data: { factor: f.key, outcome, lag, d: r.comparison.d, diff: r.comparison.diff, direction: higher ? "higher" : "lower", cutoff: r.cutoff },
        });
      }
    }
  }

  /* 2. Recent change: last 21 days vs the 42 before */
  const recentFrom = addDays(opts.today, -20);
  const baseFrom = addDays(opts.today, -62);
  const baseTo = addDays(opts.today, -21);
  const changeKeys = ["sleep_hours", "bedtime", "steps", "workout_minutes", "exercised", "mood", "energy", "focus", "habit_rate", "main_habit_rate", "work_hours", "meetings", "spending", "screen_time_hours", "weight"];
  for (const key of changeKeys) {
    const res = comparePeriods(frame, key, { from: recentFrom, to: opts.today }, { from: baseFrom, to: baseTo });
    const { a, b, d, diff } = res.comparison;
    if (a.n < 8 || b.n < 10 || d == null || Math.abs(d) < 0.5 || res.confidence.level === "insufficient") continue;
    const info = lookup(key);
    if (info.format === "score" && Math.abs(diff ?? 0) < 0.5) continue;
    if ((info.format === "percent" || info.format === "binary") && Math.abs(diff ?? 0) < 0.1) continue;
    const up = (diff ?? 0) > 0;
    const good = info.higherIsBetter == null ? null : info.higherIsBetter === up;
    const noun = aggregateNoun(info);
    drafts.push({
      fingerprint: `change:${key}`,
      kind: "change",
      evidenceLevel: "observation",
      title: `${info.label}: ${up ? "עלייה" : "ירידה"} בשלושת השבועות האחרונים`,
      summary: `${noun} בשלושת השבועות האחרונים היה ${formatFieldValue(info, a.mean)}, לעומת ${formatFieldValue(info, b.mean)} בששת השבועות שלפני כן.`,
      body:
        good == null
          ? "זה שינוי בנתונים — לא בהכרח טוב או רע."
          : good
            ? "שינוי בכיוון הרצוי. שווה לבדוק מה השתנה בתקופה הזו."
            : "שינוי שכדאי לשים לב אליו. שווה לבדוק מה השתנה בתקופה הזו.",
      periodStart: baseFrom,
      periodEnd: opts.today,
      sampleSize: a.n + b.n,
      confidence: res.confidence.level as InsightDraft["confidence"],
      confidenceReason: res.confidence.reason,
      caveats: ["השוואה בין תקופות מראה ששינוי קרה, לא למה הוא קרה.", "חגים, חופשות או מחלה עשויים להסביר חלק מהשינוי."],
      score: Math.abs(d) * Math.sqrt(Math.min(a.n, b.n)) * confWeight[res.confidence.level] * 1.1,
      evidence: [
        {
          kind: "comparison",
          label: "שלושה שבועות אחרונים מול ששה שבועות קודמים",
          data: {
            metric: info.label,
            groups: [
              { label: "3 השבועות האחרונים", n: a.n, mean: formatFieldValue(info, a.mean), median: formatFieldValue(info, a.median), raw: a.mean },
              { label: "6 השבועות שלפני", n: b.n, mean: formatFieldValue(info, b.mean), median: formatFieldValue(info, b.median), raw: b.mean },
            ],
            difference: diffText(info, res.comparison),
          },
        },
        seriesEvidence(frame.filter((r) => r.date >= baseFrom), key, info, `${info.label} לאורך זמן`),
      ],
      data: { key, d, diff, direction: up ? "up" : "down" },
    });
  }

  /* 3. Change-point in the longer history (≥ 6 weeks) */
  if (frame.length >= 42) {
    for (const key of ["sleep_hours", "mood", "energy", "habit_rate", "exercised", "steps"]) {
      const vals = column(frame, key);
      const cp = changePoint(vals, 10);
      if (!cp) continue;
      const info = lookup(key);
      const date = frame[cp.index].date;
      // Only interesting if it is not simply the same as the "recent change" window.
      if (date >= recentFrom) continue;
      const nBefore = vals.slice(0, cp.index).filter((v) => v != null).length;
      const nAfter = vals.slice(cp.index).filter((v) => v != null).length;
      const conf = assessConfidence({ n: nBefore + nAfter, groups: [nBefore, nAfter], effect: cp.d, effectType: "d" });
      if (conf.level === "insufficient" || conf.level === "low") continue;
      drafts.push({
        fingerprint: `cp:${key}`,
        kind: "change",
        evidenceLevel: "observation",
        title: `${info.label}: נקודת מפנה סביב ${date.slice(8, 10)}/${date.slice(5, 7)}`,
        summary: `עד ${date.slice(8, 10)}/${date.slice(5, 7)} ${aggregateNoun(info)} היה ${formatFieldValue(info, cp.before)}, ומאז — ${formatFieldValue(info, cp.after)}.`,
        body: "המערכת מחפשת את הנקודה שבה הממוצע השתנה הכי בבירור. כדאי לבדוק מה קרה סביב התאריך הזה.",
        periodStart: frame[0].date,
        periodEnd: frame[frame.length - 1].date,
        sampleSize: nBefore + nAfter,
        confidence: conf.level as InsightDraft["confidence"],
        confidenceReason: conf.reason,
        caveats: ["התאריך המדויק הוא הערכה — השינוי יכול היה להיות הדרגתי."],
        score: Math.abs(cp.d) * Math.sqrt(Math.min(nBefore, nAfter)) * 0.8,
        evidence: [seriesEvidence(frame, key, info, `${info.label} — ממוצע שבועי`, true)],
        data: { key, date, before: round(cp.before, 3), after: round(cp.after, 3), d: round(cp.d, 2) },
      });
    }
  }

  /* 4. Weekday pattern for habit completion */
  for (const key of ["main_habit_rate", "habit_rate", "mood", "exercised"]) {
    if (coverage(frame, key) < 28) continue;
    const dow = dayOfWeek(frame, key).filter((d) => d.n >= 4 && d.mean != null);
    if (dow.length < 5) continue;
    const sorted = [...dow].sort((a, b) => (a.mean ?? 0) - (b.mean ?? 0));
    const worst = sorted[0];
    const others = dow.filter((d) => d.weekday !== worst.weekday);
    const othersMean = others.reduce((s, d) => s + (d.mean ?? 0) * d.n, 0) / others.reduce((s, d) => s + d.n, 0);
    const info = lookup(key);
    const gap = othersMean - (worst.mean ?? 0);
    const meaningful = info.format === "score" ? gap >= 1 : gap >= 0.2;
    if (!meaningful) continue;
    const n = dow.reduce((s, d) => s + d.n, 0);
    const conf: InsightDraft["confidence"] = worst.n >= 8 && n >= 56 ? "medium" : "low";
    drafts.push({
      fingerprint: `dow:${key}`,
      kind: "pattern",
      evidenceLevel: "observation",
      title: `יום ${worst.name} בולט ב${info.label}`,
      summary: `בימי ${worst.name} ${aggregateNoun(info)} היה ${formatFieldValue(info, worst.mean)}, לעומת ${formatFieldValue(info, othersMean)} בשאר ימי השבוע.`,
      body: `מבוסס על ${worst.n} ימי ${worst.name}. ייתכן שיש משהו קבוע בלוח הזמנים של היום הזה.`,
      periodStart: period[0],
      periodEnd: period[1],
      sampleSize: n,
      confidence: conf,
      confidenceReason: `${conf === "medium" ? "ביטחון בינוני" : "ביטחון נמוך"} — ${worst.n} ימי ${worst.name} מתוך ${n} ימים עם נתונים.`,
      caveats: ["דפוסים לפי יום בשבוע מושפעים מחגים ומשבועות חריגים."],
      score: (info.format === "score" ? gap / 2 : gap * 3) * Math.sqrt(worst.n) * 0.6,
      evidence: [
        {
          kind: "table",
          label: `${info.label} לפי יום בשבוע`,
          data: { columns: ["יום", "ממוצע", "ימים"], rows: dayOfWeek(frame, key).map((d) => [d.name, formatFieldValue(info, d.mean), String(d.n)]) },
        },
      ],
      data: { key, weekday: worst.weekday, gap: round(gap, 3) },
    });
  }

  /* 5. Habit consistency shift: last 14 days vs the 28 before */
  for (const id of opts.mainHabitIds) {
    const key = `habit:${id}`;
    const res = comparePeriods(frame, key, { from: addDays(opts.today, -13), to: addDays(opts.today, -1) }, { from: addDays(opts.today, -41), to: addDays(opts.today, -14) });
    const { a, b, diff } = res.comparison;
    if (a.n < 3 || b.n < 6 || diff == null || Math.abs(diff) < 0.3) continue;
    const info = lookup(key);
    const up = diff > 0;
    drafts.push({
      fingerprint: `habitshift:${id}`,
      kind: "trend",
      evidenceLevel: "observation",
      title: `„${info.label}”: ${up ? "יותר עקביות" : "פחות עקביות"} לאחרונה`,
      summary: `בשבועיים האחרונים השלמת ${Math.round((a.mean ?? 0) * 100)}% מהפעמים המתוכננות, לעומת ${Math.round((b.mean ?? 0) * 100)}% בארבעת השבועות שלפני.`,
      periodStart: addDays(opts.today, -41),
      periodEnd: addDays(opts.today, -1),
      sampleSize: a.n + b.n,
      confidence: a.n >= 6 && b.n >= 12 ? "medium" : "low",
      confidenceReason: `מבוסס על ${a.n} ימים מתוכננים בשבועיים האחרונים ו־${b.n} בתקופה שלפני.`,
      caveats: ["מספר הימים המתוכננים קטן, כך שכל יום משפיע הרבה על האחוז."],
      score: Math.abs(diff) * Math.sqrt(a.n) * 1.2,
      evidence: [
        {
          kind: "comparison",
          label: "שיעור השלמה",
          data: {
            metric: info.label,
            groups: [
              { label: "שבועיים אחרונים", n: a.n, mean: `${Math.round((a.mean ?? 0) * 100)}%`, median: "—", raw: a.mean },
              { label: "4 השבועות שלפני", n: b.n, mean: `${Math.round((b.mean ?? 0) * 100)}%`, median: "—", raw: b.mean },
            ],
            difference: diffText(info, res.comparison),
          },
        },
      ],
      data: { habitId: id, diff },
    });
  }

  // Keep the strongest finding per (factor, outcome) and the top overall.
  const best = new Map<string, InsightDraft>();
  for (const d of drafts) {
    const group = d.kind === "correlation" ? `${d.data.factor}→${d.data.outcome}` : d.fingerprint;
    const cur = best.get(group);
    if (!cur || d.score > cur.score) best.set(group, d);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 16);
}
