/**
 * The Day Frame: one row per local date with every signal aligned — the backbone for
 * correlations, comparisons, experiments and AI context.
 *
 * Missing data stays `null` (unknown), never 0, so absent tracking isn't mistaken for
 * "didn't happen".
 */
import { addDays, eachDay, toLocalDate, weekday, type ISODate } from "@/lib/dates";
import { METRIC_MAP, type Aggregation } from "@/lib/metrics";
import { credit, isDueOn, isScheduled, type HabitLike, type HabitStatus } from "./habit-stats";

export interface FrameHabit extends HabitLike {
  name: string;
  tier: "main" | "side";
  metricKey: string | null;
}

export interface FrameInputs {
  from: ISODate;
  to: ISODate;
  today: ISODate;
  timezone: string;
  habits: FrameHabit[];
  habitEvents: { habitId: string; date: ISODate; status: HabitStatus; value: number | null }[];
  checkins: { date: ISODate; mood: number | null; energy: number | null; focus: number | null }[];
  metrics: { metricKey: string; date: ISODate; value: number }[];
  customAggregations?: Record<string, Aggregation>;
  transactions: { date: ISODate; amount: number; category: string }[];
  calendar: { startAt: Date; endAt: Date; allDay: boolean; kind: string }[];
  /** Whether calendar data covers this period (so 0 meetings is a real zero). */
  calendarTracked: boolean;
  journalDates: ISODate[];
}

export interface DayRow {
  date: ISODate;
  weekday: number;
  isWeekend: boolean;
  v: Record<string, number | null>;
}

export const EXERCISE_METRIC = "workout_minutes";

function aggregate(values: number[], agg: Aggregation): number | null {
  if (!values.length) return null;
  switch (agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "max":
      return Math.max(...values);
    case "last":
      return values[values.length - 1];
  }
}

export function buildFrame(inp: FrameInputs): DayRow[] {
  const days = eachDay(inp.from, inp.to);
  const rows = new Map<ISODate, DayRow>(
    days.map((d) => {
      const wd = weekday(d);
      // Israeli weekend: Friday & Saturday.
      return [d, { date: d, weekday: wd, isWeekend: wd === 5 || wd === 6, v: {} }];
    }),
  );

  /* Check-ins */
  for (const c of inp.checkins) {
    const r = rows.get(c.date);
    if (!r) continue;
    r.v.mood = c.mood;
    r.v.energy = c.energy;
    r.v.focus = c.focus;
  }

  /* Metrics */
  const byKeyDate = new Map<string, number[]>();
  for (const m of inp.metrics) {
    const k = `${m.metricKey}|${m.date}`;
    const arr = byKeyDate.get(k);
    if (arr) arr.push(m.value);
    else byKeyDate.set(k, [m.value]);
  }
  for (const [k, vals] of byKeyDate) {
    const [key, date] = k.split("|");
    const r = rows.get(date);
    if (!r) continue;
    const agg = METRIC_MAP.get(key)?.aggregation ?? inp.customAggregations?.[key] ?? "sum";
    r.v[key] = aggregate(vals, agg);
    if (key === EXERCISE_METRIC) r.v.workouts = vals.length;
  }

  /* Habits */
  const evMap = new Map<string, { status: HabitStatus; value: number | null }>();
  for (const e of inp.habitEvents) evMap.set(`${e.habitId}|${e.date}`, e);
  const exerciseHabits = inp.habits.filter((h) => h.metricKey === EXERCISE_METRIC);

  for (const d of days) {
    const r = rows.get(d)!;
    if (d > inp.today) continue;
    let due = 0;
    let done = 0;
    let mainDue = 0;
    let mainDone = 0;
    let sideDue = 0;
    let sideDone = 0;
    for (const h of inp.habits) {
      if (!isDueOn(h, d)) continue;
      const ev = evMap.get(`${h.id}|${d}`);
      const col = `habit:${h.id}`;
      // Skipped days and today's still-pending habits are unknown, not failures.
      if (ev?.status === "skipped" || (d === inp.today && !ev)) {
        r.v[col] = null;
        continue;
      }
      const c = credit(ev?.status);
      r.v[col] = c;
      // Weekly-count habits have no daily expectation, so they don't enter the daily completion rate.
      if (h.frequency === "weekly_count" || !isScheduled(h, d)) continue;
      due++;
      done += c;
      if (h.tier === "main") {
        mainDue++;
        mainDone += c;
      } else {
        sideDue++;
        sideDone += c;
      }
    }
    r.v.habits_due = due || null;
    r.v.habits_done = due ? done : null;
    r.v.habit_rate = due ? done / due : null;
    r.v.main_habit_rate = mainDue ? mainDone / mainDue : null;
    r.v.side_habit_rate = sideDue ? sideDone / sideDue : null;

    /* Exercise signal: workout metric or an exercise-linked habit completed. */
    const workoutMinutes = r.v[EXERCISE_METRIC];
    const habitExercise = exerciseHabits.some((h) => credit(evMap.get(`${h.id}|${d}`)?.status) > 0);
    const tracking = exerciseHabits.some((h) => d >= h.startDate) || workoutMinutes != null;
    if ((workoutMinutes ?? 0) > 0 || habitExercise) r.v.exercised = 1;
    else if (tracking && d < inp.today) r.v.exercised = 0;
    else r.v.exercised = null;
  }

  /* Spending */
  for (const t of inp.transactions) {
    const r = rows.get(t.date);
    if (!r) continue;
    r.v.spending = (r.v.spending ?? 0) + t.amount;
    r.v[`spending:${t.category}`] = (r.v[`spending:${t.category}`] ?? 0) + t.amount;
  }

  /* Calendar */
  if (inp.calendarTracked) {
    for (const d of days) {
      const r = rows.get(d)!;
      if (d > inp.today) continue;
      r.v.meetings = 0;
      r.v.calendar_hours = 0;
    }
  }
  for (const e of inp.calendar) {
    if (e.allDay) continue;
    const d = toLocalDate(e.startAt, inp.timezone);
    const r = rows.get(d);
    if (!r) continue;
    const hours = Math.max(0, (e.endAt.getTime() - e.startAt.getTime()) / 3_600_000);
    r.v.calendar_hours = (r.v.calendar_hours ?? 0) + Math.min(hours, 12);
    if (e.kind === "meeting" || e.kind === "other") r.v.meetings = (r.v.meetings ?? 0) + 1;
  }

  /* Journal */
  for (const d of inp.journalDates) {
    const r = rows.get(d);
    if (r) r.v.journal = (r.v.journal ?? 0) + 1;
  }

  return days.map((d) => rows.get(d)!);
}

/** Extract a column. `lag` shifts the series: lag=1 → value from the previous day. */
export function column(frame: DayRow[], key: string, lag = 0): (number | null)[] {
  return frame.map((_, i) => {
    const j = i - lag;
    if (j < 0 || j >= frame.length) return null;
    const v = frame[j].v[key];
    return v === undefined ? null : v;
  });
}

export function coverage(frame: DayRow[], key: string): number {
  return frame.filter((r) => r.v[key] != null).length;
}

/** Weekly buckets (Sunday-start) with mean per key. */
export function weeklyMeans(frame: DayRow[], keys: string[]) {
  const buckets = new Map<ISODate, DayRow[]>();
  for (const r of frame) {
    const ws = addDays(r.date, -r.weekday);
    const b = buckets.get(ws);
    if (b) b.push(r);
    else buckets.set(ws, [r]);
  }
  return [...buckets.entries()].map(([weekStart, rs]) => {
    const out: Record<string, number | null> = {};
    for (const k of keys) {
      const vals = rs.map((r) => r.v[k]).filter((x): x is number => x != null);
      out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return { weekStart, days: rs.length, values: out };
  });
}
