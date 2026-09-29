/**
 * Human metadata for Day Frame columns (used by analytics text templates, the AI context
 * builder, charts and the experiments UI).
 */
import { METRIC_MAP, SPENDING_LABEL } from "./metrics";

export type FieldFormat = "score" | "percent" | "hours" | "minutes" | "integer" | "decimal" | "currency" | "binary" | "clock";

export interface FieldInfo {
  key: string;
  label: string;
  /** Definite construct form used inside sentences: "ממוצע ___" / "שיעור ___" (binary). */
  phrase: string;
  format: FieldFormat;
  higherIsBetter: boolean | null;
  group: "wellbeing" | "habits" | "health" | "fitness" | "work" | "finance" | "environment" | "other";
}

const F = (f: FieldInfo) => f;

export const CORE_FIELDS: Record<string, FieldInfo> = {
  mood: F({ key: "mood", label: "מצב רוח", phrase: "מצב הרוח", format: "score", higherIsBetter: true, group: "wellbeing" }),
  energy: F({ key: "energy", label: "אנרגיה", phrase: "האנרגיה", format: "score", higherIsBetter: true, group: "wellbeing" }),
  focus: F({ key: "focus", label: "ריכוז", phrase: "הריכוז", format: "score", higherIsBetter: true, group: "wellbeing" }),
  habit_rate: F({ key: "habit_rate", label: "השלמת הרגלים", phrase: "השלמת ההרגלים", format: "percent", higherIsBetter: true, group: "habits" }),
  main_habit_rate: F({ key: "main_habit_rate", label: "פעילויות מתוכננות", phrase: "ביצוע הפעילויות המתוכננות", format: "percent", higherIsBetter: true, group: "habits" }),
  side_habit_rate: F({ key: "side_habit_rate", label: "הרגלים יומיים", phrase: "השלמת ההרגלים היומיים", format: "percent", higherIsBetter: true, group: "habits" }),
  habits_done: F({ key: "habits_done", label: "הרגלים שהושלמו", phrase: "ההרגלים שהושלמו", format: "decimal", higherIsBetter: true, group: "habits" }),
  exercised: F({ key: "exercised", label: "אימון", phrase: "ימי אימון", format: "binary", higherIsBetter: true, group: "fitness" }),
  workouts: F({ key: "workouts", label: "אימונים", phrase: "האימונים", format: "integer", higherIsBetter: true, group: "fitness" }),
  meetings: F({ key: "meetings", label: "פגישות", phrase: "הפגישות", format: "integer", higherIsBetter: null, group: "work" }),
  calendar_hours: F({ key: "calendar_hours", label: "שעות ביומן", phrase: "השעות התפוסות ביומן", format: "hours", higherIsBetter: null, group: "work" }),
  spending: F({ key: "spending", label: "הוצאות", phrase: "ההוצאות", format: "currency", higherIsBetter: false, group: "finance" }),
  journal: F({ key: "journal", label: "כתיבה ביומן", phrase: "רשומות היומן", format: "integer", higherIsBetter: null, group: "other" }),
};

const metricFormat = (f: string): FieldFormat =>
  f === "hours" ? "hours" : f === "minutes" ? "minutes" : f === "clock" ? "clock" : f === "integer" ? "integer" : f === "currency" ? "currency" : "decimal";

const metricGroup = (c: string): FieldInfo["group"] =>
  c === "health" ? "health" : c === "fitness" ? "fitness" : c === "work" || c === "productivity" || c === "learning" ? "work" : c === "environment" ? "environment" : c === "finance" ? "finance" : "other";

export function fieldInfo(key: string, habitNames?: Map<string, string>, custom?: Map<string, { label: string; unit?: string | null }>): FieldInfo {
  if (CORE_FIELDS[key]) return CORE_FIELDS[key];
  if (key.startsWith("habit:")) {
    const name = habitNames?.get(key.slice(6)) ?? "הרגל";
    return { key, label: name, phrase: `ההשלמה של „${name}”`, format: "binary", higherIsBetter: true, group: "habits" };
  }
  if (key.startsWith("spending:")) {
    const cat = SPENDING_LABEL.get(key.slice(9)) ?? key.slice(9);
    return { key, label: `הוצאות: ${cat}`, phrase: `ההוצאות על ${cat}`, format: "currency", higherIsBetter: false, group: "finance" };
  }
  const m = METRIC_MAP.get(key);
  if (m) return { key, label: m.label, phrase: m.phrase ?? m.label, format: metricFormat(m.format), higherIsBetter: m.higherIsBetter, group: metricGroup(m.category) };
  const c = custom?.get(key);
  return { key, label: c?.label ?? key, phrase: c?.label ?? key, format: "decimal", higherIsBetter: null, group: "other" };
}

/** Format a Day Frame value in Hebrew. */
export function formatFieldValue(info: FieldInfo, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  switch (info.format) {
    case "score":
      return `${(Math.round(v * 10) / 10).toLocaleString("he-IL")}/10`;
    case "percent":
    case "binary":
      return `${Math.round(v * 100)}%`;
    case "hours": {
      const t = Math.round(v * 60);
      const h = Math.floor(t / 60);
      const m = t % 60;
      return h ? (m ? `${h}:${String(m).padStart(2, "0")} שע׳` : `${h} שע׳`) : `${m} דק׳`;
    }
    case "minutes":
      return `${Math.round(v)} דק׳`;
    case "integer":
      return Math.round(v).toLocaleString("he-IL");
    case "currency":
      return `₪${Math.round(v).toLocaleString("he-IL")}`;
    case "clock": {
      const mins = Math.round(v + 720) % 1440;
      return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    }
    default:
      return (Math.round(v * 10) / 10).toLocaleString("he-IL");
  }
}

/** "ממוצע מצב הרוח" / "שיעור ימי האימון" */
export function aggregateNoun(info: FieldInfo): string {
  return `${info.format === "binary" ? "שיעור" : "ממוצע"} ${info.phrase}`;
}
