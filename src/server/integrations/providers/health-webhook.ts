import "server-only";
import { z } from "zod";
import { isValidISODate, toLocalDate, type ISODate } from "@/lib/dates";
import { bedtimeFromClock, METRIC_MAP } from "@/lib/metrics";
import type { IntegrationDefinition, NormalizedRecord } from "../types";

/**
 * Apple Health has no web API. The reliable free route is an iOS Shortcut (personal
 * automation) that reads Health samples and POSTs them to a private webhook URL.
 * We also accept the JSON format of the "Health Auto Export" app.
 */
export const healthWebhook: IntegrationDefinition = {
  id: "health_webhook",
  name: "Apple Health (קיצור דרך)",
  description: "שינה, צעדים, אימונים, דופק ומשקל מהאייפון — דרך אוטומציה של אפליקציית קיצורים ששולחת לקישור פרטי.",
  category: "health",
  auth: "webhook",
  dataTypes: ["שינה", "צעדים", "אימונים", "דופק במנוחה", "HRV", "משקל", "קלוריות"],
  status: "available",
  fields: [],
  setupSteps: [
    "אחרי החיבור תקבל קישור פרטי. שמור אותו — הוא מוצג פעם אחת בלבד.",
    "באייפון: קיצורים ← אוטומציה ← „שעה ביום” (למשל 09:00) ← „הפעל מיד”.",
    "הוסף פעולות „מצא דגימות בריאות” לשינה, צעדים ואימונים של אתמול.",
    "הוסף „קבל תוכן מ־URL” עם הקישור, שיטה POST, גוף JSON: records = רשימה של { type, value, date }.",
    "סוגים נתמכים: sleep_hours, bedtime (HH:MM), steps, workout_minutes, active_kcal, resting_hr, hrv, weight, protein_g, screen_time_hours.",
  ],
};

const simpleRecord = z.object({
  type: z.string().min(1).max(60),
  value: z.union([z.number(), z.string()]),
  date: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  name: z.string().max(120).optional(),
  id: z.string().max(200).optional(),
});

const simplePayload = z.object({ records: z.array(simpleRecord).max(5000) });

// Health Auto Export (https://www.healthyapps.dev) — subset.
const haePayload = z.object({
  data: z.object({
    metrics: z
      .array(z.object({ name: z.string(), units: z.string().optional(), data: z.array(z.record(z.string(), z.unknown())) }))
      .optional(),
    workouts: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});

const HAE_MAP: Record<string, { key: string; field: string; transform?: (v: number, units?: string) => number }> = {
  step_count: { key: "steps", field: "qty" },
  active_energy: { key: "active_kcal", field: "qty", transform: (v, u) => (u === "kJ" ? v / 4.184 : v) },
  resting_heart_rate: { key: "resting_hr", field: "qty" },
  heart_rate_variability: { key: "hrv", field: "qty" },
  weight_body_mass: { key: "weight", field: "qty", transform: (v, u) => (u === "lb" ? v * 0.4536 : v) },
  sleep_analysis: { key: "sleep_hours", field: "asleep" },
  dietary_protein: { key: "protein_g", field: "qty" },
};

const ALIASES: Record<string, string> = {
  sleep: "sleep_hours",
  steps_count: "steps",
  step_count: "steps",
  workout: "workout_minutes",
  workouts: "workout_minutes",
  exercise_minutes: "workout_minutes",
  active_energy: "active_kcal",
  resting_heart_rate: "resting_hr",
  body_mass: "weight",
  protein: "protein_g",
  screen_time: "screen_time_hours",
};

function parseDateLike(s: string | undefined, tz: string): { date: ISODate | null; instant: Date | null } {
  if (!s) return { date: null, instant: null };
  if (isValidISODate(s)) return { date: s, instant: null };
  // "2026-09-28 00:00:00 +0300" (Health Auto Export) → ISO
  const normalized = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/, "$1T$2$3:$4");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return { date: null, instant: null };
  return { date: toLocalDate(d, tz), instant: d };
}

export function normalizeHealthPayload(body: unknown, tz: string, today: ISODate): { records: NormalizedRecord[]; rejected: number } {
  const records: NormalizedRecord[] = [];
  let rejected = 0;

  const simple = simplePayload.safeParse(body);
  if (simple.success) {
    for (const r of simple.data.records) {
      const key = ALIASES[r.type] ?? r.type;
      const start = parseDateLike(r.start, tz);
      const end = parseDateLike(r.end, tz);
      const date = parseDateLike(r.date, tz).date ?? end.date ?? start.date ?? today;
      let value: number;
      if (key === "bedtime" && typeof r.value === "string") value = bedtimeFromClock(r.value);
      else value = typeof r.value === "number" ? r.value : Number(String(r.value).replace(",", "."));
      if (!Number.isFinite(value) || (!METRIC_MAP.has(key) && !/^[a-z][a-z0-9_]{1,40}$/.test(key))) {
        rejected++;
        continue;
      }
      // Durations in seconds/minutes are common from Shortcuts; normalise sleep to hours.
      if (key === "sleep_hours" && value > 24) value = value > 1440 ? value / 3600 : value / 60;
      const externalId = r.id ?? `${key}|${date}|${r.start ?? ""}`;
      records.push({
        externalId,
        recordType: key,
        raw: r,
        outputs: [{ type: "metric", metricKey: key, value: Math.round(value * 100) / 100, date, startAt: start.instant, endAt: end.instant, rawValue: r.value, note: r.name ?? null }],
      });
    }
    return { records, rejected };
  }

  const hae = haePayload.safeParse(body);
  if (hae.success) {
    for (const m of hae.data.data.metrics ?? []) {
      const map = HAE_MAP[m.name];
      if (!map) continue;
      // Aggregate per local date (HAE may send hourly points).
      const byDate = new Map<ISODate, number[]>();
      for (const p of m.data) {
        const { date } = parseDateLike(String(p.date ?? p.sleepEnd ?? ""), tz);
        const raw = Number(p[map.field] ?? p.qty);
        if (!date || !Number.isFinite(raw)) continue;
        const v = map.transform ? map.transform(raw, m.units) : raw;
        byDate.set(date, [...(byDate.get(date) ?? []), v]);
      }
      const agg = METRIC_MAP.get(map.key)?.aggregation ?? "sum";
      for (const [date, vals] of byDate) {
        const value = agg === "sum" ? vals.reduce((a, b) => a + b, 0) : agg === "last" ? vals[vals.length - 1] : vals.reduce((a, b) => a + b, 0) / vals.length;
        records.push({
          externalId: `hae|${map.key}|${date}`,
          recordType: map.key,
          raw: { name: m.name, units: m.units, date, points: vals.length },
          outputs: [{ type: "metric", metricKey: map.key, value: Math.round(value * 100) / 100, date, rawValue: vals }],
        });
      }
    }
    for (const w of hae.data.data.workouts ?? []) {
      const start = parseDateLike(String(w.start ?? ""), tz);
      const end = parseDateLike(String(w.end ?? ""), tz);
      if (!start.date || !start.instant) continue;
      const minutes = end.instant ? (end.instant.getTime() - start.instant.getTime()) / 60_000 : Number(w.duration ?? 0) / 60;
      if (!Number.isFinite(minutes) || minutes <= 0) continue;
      records.push({
        externalId: `hae|workout|${start.instant.toISOString()}`,
        recordType: "workout",
        raw: w,
        outputs: [{ type: "metric", metricKey: "workout_minutes", value: Math.round(minutes), date: start.date, startAt: start.instant, endAt: end.instant, note: String(w.name ?? ""), meta: { name: w.name } }],
      });
    }
    return { records, rejected };
  }

  return { records, rejected: -1 };
}
