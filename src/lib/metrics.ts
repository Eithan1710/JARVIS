/**
 * Built-in metric catalogue. Labels are written for a Hebrew-speaking user.
 * Custom metrics (metric_definitions table) are merged with these at runtime.
 */

export type MetricCategory =
  | "health"
  | "fitness"
  | "work"
  | "productivity"
  | "learning"
  | "finance"
  | "environment"
  | "other";

export type Aggregation = "sum" | "avg" | "last" | "max";

export interface MetricDef {
  key: string;
  label: string;
  /** Short unit label in Hebrew, rendered after the value. */
  unit: string;
  category: MetricCategory;
  aggregation: Aggregation;
  /** null = neutral (no "better" direction). */
  higherIsBetter: boolean | null;
  /** Definite construct form for sentences ("ממוצע ___"). */
  phrase?: string;
  /** Display formatter hint. */
  format: "hours" | "minutes" | "integer" | "decimal" | "clock" | "currency";
  /** Suggested input step/limits for manual entry. */
  input?: { min?: number; max?: number; step?: number };
  builtin: true;
}

const m = (d: Omit<MetricDef, "builtin">): MetricDef => ({ ...d, builtin: true });

export const BUILTIN_METRICS: MetricDef[] = [
  m({ key: "sleep_hours", phrase: "השינה", label: "שינה", unit: "שעות", category: "health", aggregation: "sum", higherIsBetter: true, format: "hours", input: { min: 0, max: 16, step: 0.25 } }),
  m({ key: "bedtime", phrase: "שעת ההירדמות", label: "שעת הירדמות", unit: "", category: "health", aggregation: "avg", higherIsBetter: false, format: "clock" }),
  m({ key: "steps", phrase: "הצעדים", label: "צעדים", unit: "צעדים", category: "fitness", aggregation: "sum", higherIsBetter: true, format: "integer", input: { min: 0, max: 100000, step: 100 } }),
  m({ key: "workout_minutes", phrase: "דקות האימון", label: "אימון", unit: "דק׳", category: "fitness", aggregation: "sum", higherIsBetter: true, format: "minutes", input: { min: 0, max: 600, step: 5 } }),
  m({ key: "active_kcal", phrase: "קלוריות הפעילות", label: "קלוריות פעילות", unit: "קק״ל", category: "fitness", aggregation: "sum", higherIsBetter: true, format: "integer" }),
  m({ key: "resting_hr", phrase: "הדופק במנוחה", label: "דופק במנוחה", unit: "פעימות", category: "health", aggregation: "avg", higherIsBetter: false, format: "integer" }),
  m({ key: "hrv", phrase: "ה־HRV", label: "HRV", unit: "ms", category: "health", aggregation: "avg", higherIsBetter: true, format: "integer" }),
  m({ key: "weight", phrase: "המשקל", label: "משקל", unit: "ק״ג", category: "health", aggregation: "last", higherIsBetter: null, format: "decimal", input: { min: 30, max: 250, step: 0.1 } }),
  m({ key: "protein_g", phrase: "צריכת החלבון", label: "חלבון", unit: "גרם", category: "health", aggregation: "sum", higherIsBetter: true, format: "integer", input: { min: 0, max: 400, step: 5 } }),
  m({ key: "work_hours", phrase: "שעות העבודה", label: "עבודה", unit: "שעות", category: "work", aggregation: "sum", higherIsBetter: null, format: "hours", input: { min: 0, max: 20, step: 0.25 } }),
  m({ key: "deep_work_hours", phrase: "העבודה הממוקדת", label: "עבודה ממוקדת", unit: "שעות", category: "productivity", aggregation: "sum", higherIsBetter: true, format: "hours", input: { min: 0, max: 16, step: 0.25 } }),
  m({ key: "study_minutes", phrase: "זמן הלמידה", label: "למידה", unit: "דק׳", category: "learning", aggregation: "sum", higherIsBetter: true, format: "minutes", input: { min: 0, max: 600, step: 5 } }),
  m({ key: "reading_minutes", phrase: "זמן הקריאה", label: "קריאה", unit: "דק׳", category: "learning", aggregation: "sum", higherIsBetter: true, format: "minutes", input: { min: 0, max: 600, step: 5 } }),
  m({ key: "meditation_minutes", phrase: "זמן המדיטציה", label: "מדיטציה", unit: "דק׳", category: "health", aggregation: "sum", higherIsBetter: true, format: "minutes", input: { min: 0, max: 180, step: 1 } }),
  m({ key: "screen_time_hours", phrase: "זמן המסך", label: "זמן מסך", unit: "שעות", category: "productivity", aggregation: "sum", higherIsBetter: false, format: "hours", input: { min: 0, max: 20, step: 0.25 } }),
  m({ key: "commits", phrase: "הקומיטים", label: "קומיטים", unit: "", category: "work", aggregation: "sum", higherIsBetter: null, format: "integer" }),
  m({ key: "temp_max", phrase: "הטמפרטורה המרבית", label: "טמפרטורה מרבית", unit: "°", category: "environment", aggregation: "avg", higherIsBetter: null, format: "decimal" }),
  m({ key: "precipitation_mm", phrase: "המשקעים", label: "משקעים", unit: "מ״מ", category: "environment", aggregation: "sum", higherIsBetter: null, format: "decimal" }),
];

export const METRIC_MAP = new Map(BUILTIN_METRICS.map((d) => [d.key, d]));

export const CATEGORY_LABELS: Record<MetricCategory | "habits" | "goals" | "journal" | "calendar" | "checkins", string> = {
  health: "בריאות",
  fitness: "כושר",
  work: "עבודה",
  productivity: "פרודוקטיביות",
  learning: "למידה",
  finance: "כספים",
  environment: "סביבה ומזג אוויר",
  other: "אחר",
  habits: "הרגלים",
  goals: "מטרות",
  journal: "יומן",
  calendar: "יומן פגישות",
  checkins: "צ׳ק־אין יומי",
};

export const SPENDING_CATEGORIES: { key: string; label: string }[] = [
  { key: "groceries", label: "סופר" },
  { key: "restaurants", label: "מסעדות ובתי קפה" },
  { key: "transport", label: "תחבורה" },
  { key: "shopping", label: "קניות" },
  { key: "bills", label: "חשבונות" },
  { key: "health", label: "בריאות" },
  { key: "fitness", label: "כושר" },
  { key: "entertainment", label: "בילויים" },
  { key: "travel", label: "טיולים" },
  { key: "education", label: "לימודים" },
  { key: "other", label: "אחר" },
];

export const SPENDING_LABEL = new Map(SPENDING_CATEGORIES.map((c) => [c.key, c.label]));

/** Bedtime is stored as minutes after 12:00 so that 23:30 (690) < 00:30 (750). */
export function bedtimeFromClock(hhmm: string): number {
  const [h, mm] = hhmm.split(":").map(Number);
  const mins = h * 60 + (mm || 0);
  return mins >= 12 * 60 ? mins - 12 * 60 : mins + 12 * 60;
}

export function bedtimeToClock(v: number): string {
  const mins = Math.round(v + 12 * 60) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
