/**
 * Plain-language confidence. Deliberately coarse (high/medium/low) — we never present
 * personal self-tracking statistics as more scientific than they are.
 */
import { plural } from "@/lib/format";

export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient";

export interface ConfidenceInput {
  /** Total comparable observations (days). */
  n: number;
  /** Group sizes for condition comparisons. */
  groups?: [number, number];
  /** Absolute effect size: Cohen's d for comparisons, |r| for correlations. */
  effect: number | null;
  effectType: "d" | "r";
  /** Optional human labels for the two groups, e.g. ["ימים עם אימון", "ימים בלי"]. */
  groupLabels?: [string, string];
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  reason: string;
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "ביטחון גבוה",
  medium: "ביטחון בינוני",
  low: "ביטחון נמוך",
  insufficient: "אין מספיק נתונים",
};

export function assessConfidence(i: ConfidenceInput): ConfidenceResult {
  const minGroup = i.groups ? Math.min(i.groups[0], i.groups[1]) : i.n;
  const e = Math.abs(i.effect ?? 0);
  const strong = i.effectType === "d" ? e >= 0.8 : e >= 0.5;
  const moderate = i.effectType === "d" ? e >= 0.5 : e >= 0.35;

  let level: ConfidenceLevel;
  if (i.n < 8 || minGroup < 4) level = "insufficient";
  else if (i.n < 14 || minGroup < 6 || !moderate) level = "low";
  else if (i.n < 30 || minGroup < 10 || !strong) level = "medium";
  else level = "high";

  const base = `מבוסס על ${plural(i.n, "יום", "ימים")} שניתן להשוות`;
  const groupsText =
    i.groups && i.groupLabels
      ? ` (${i.groupLabels[0]}: ${i.groups[0]}, ${i.groupLabels[1]}: ${i.groups[1]})`
      : "";
  let tail = "";
  if (level === "insufficient") tail = " — מוקדם מדי להסיק מסקנה.";
  else if (level === "low" && !moderate) tail = " — ההבדל קטן יחסית לתנודות הרגילות.";
  else if (level === "low") tail = " — מעט מדי ימים בכל קבוצה.";
  else if (level === "medium" && !strong) tail = " — הקשר עקבי אך לא חזק.";
  else if (level === "medium") tail = " — כדאי לראות אם זה נשמר עם עוד נתונים.";
  else tail = " — הדפוס חוזר באופן עקבי.";

  return { level, reason: `${CONFIDENCE_LABEL[level]} — ${base}${groupsText}${tail}` };
}
