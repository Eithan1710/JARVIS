/**
 * Pure, deterministic habit statistics. No I/O — unit tested in tests/habit-stats.test.ts.
 */
import { addDays, eachDay, startOfWeek, weekday, type ISODate } from "@/lib/dates";

export type HabitStatus = "completed" | "partial" | "missed" | "skipped";

export interface HabitLike {
  id: string;
  frequency: "daily" | "specific_days" | "weekly_count";
  scheduleDays: number[];
  weeklyTarget: number | null;
  kind: "boolean" | "quantity";
  targetValue: number | null;
  /** First local date the habit exists (inclusive). */
  startDate: ISODate;
}

export interface HabitDay {
  date: ISODate;
  status: HabitStatus | null;
  value?: number | null;
}

export function isScheduled(h: HabitLike, date: ISODate): boolean {
  if (date < h.startDate) return false;
  if (h.frequency === "specific_days") return h.scheduleDays.includes(weekday(date));
  return true;
}

/** Whether a habit expects an action on that specific day (weekly-count habits never "expect" a given day). */
export function isDueOn(h: HabitLike, date: ISODate): boolean {
  if (h.frequency === "weekly_count") return date >= h.startDate;
  return isScheduled(h, date);
}

export function credit(status: HabitStatus | null | undefined): number {
  if (status === "completed") return 1;
  if (status === "partial") return 0.5;
  return 0;
}

export function statusFromValue(h: Pick<HabitLike, "kind" | "targetValue">, value: number | null | undefined): HabitStatus {
  if (h.kind !== "quantity" || h.targetValue == null || value == null) return value != null && value > 0 ? "completed" : "missed";
  if (value >= h.targetValue) return "completed";
  if (value > 0) return "partial";
  return "missed";
}

type EventMap = Map<ISODate, HabitDay>;
const toMap = (events: HabitDay[]): EventMap => new Map(events.map((e) => [e.date, e]));

export interface RateResult {
  rate: number | null;
  done: number;
  expected: number;
}

/**
 * Completion rate over [from, to]. `today` is treated as pending: it only counts toward the
 * denominator if it already has an outcome, so the rate doesn't drop every morning.
 */
export function completionRate(h: HabitLike, events: HabitDay[], from: ISODate, to: ISODate, today: ISODate): RateResult {
  const map = toMap(events);
  if (h.frequency === "weekly_count") {
    // Only complete weeks inside the range count; the in-progress week is reported by weekProgress().
    const target = Math.max(1, h.weeklyTarget ?? 1);
    let done = 0;
    let expected = 0;
    for (let ws = startOfWeek(from); ws <= to; ws = addDays(ws, 7)) {
      const we = addDays(ws, 6);
      if (ws < from || we > to || we >= today || ws < startOfWeek(h.startDate)) continue;
      const count = eachDay(ws, we).reduce((s, d) => s + credit(map.get(d)?.status), 0);
      expected += target;
      done += Math.min(count, target);
    }
    return { rate: expected > 0 ? done / expected : null, done, expected };
  }

  let done = 0;
  let expected = 0;
  for (const d of eachDay(from, to)) {
    if (!isScheduled(h, d) || d > today) continue;
    const ev = map.get(d);
    if (ev?.status === "skipped") continue;
    if (d === today && !ev) continue;
    expected += 1;
    done += credit(ev?.status);
  }
  return { rate: expected > 0 ? done / expected : null, done, expected };
}

export interface StreakResult {
  current: number;
  best: number;
  unit: "days" | "weeks";
}

export function streaks(h: HabitLike, events: HabitDay[], today: ISODate): StreakResult {
  const map = toMap(events);
  if (h.frequency === "weekly_count") {
    const target = Math.max(1, h.weeklyTarget ?? 1);
    const weekOk = (ws: ISODate) =>
      eachDay(ws, addDays(ws, 6)).reduce((s, d) => s + (credit(map.get(d)?.status) >= 1 ? 1 : 0), 0) >= target;
    const thisWeek = startOfWeek(today);
    let current = 0;
    let ws = weekOk(thisWeek) ? thisWeek : addDays(thisWeek, -7);
    while (ws >= startOfWeek(h.startDate) && weekOk(ws)) {
      current++;
      ws = addDays(ws, -7);
    }
    let best = 0;
    let run = 0;
    for (let w = startOfWeek(h.startDate); w <= thisWeek; w = addDays(w, 7)) {
      if (weekOk(w)) best = Math.max(best, ++run);
      else if (w !== thisWeek) run = 0;
    }
    return { current, best: Math.max(best, current), unit: "weeks" };
  }

  const kept = (d: ISODate) => {
    const s = map.get(d)?.status;
    return s === "completed" || s === "partial";
  };
  // Current streak: walk back from today (today only counts if already done).
  let current = 0;
  let d = kept(today) || !isScheduled(h, today) || map.get(today)?.status === "skipped" ? today : addDays(today, -1);
  for (let guard = 0; guard < 3660 && d >= h.startDate; guard++, d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    const s = map.get(d)?.status;
    if (s === "skipped") continue;
    if (kept(d)) current++;
    else break;
  }
  let best = 0;
  let run = 0;
  for (const day of eachDay(h.startDate, today)) {
    if (!isScheduled(h, day)) continue;
    const s = map.get(day)?.status;
    if (s === "skipped") continue;
    if (kept(day)) best = Math.max(best, ++run);
    else if (day !== today) run = 0;
  }
  return { current, best: Math.max(best, current), unit: "days" };
}

export interface WeekProgress {
  done: number;
  expected: number;
}

/** Progress for the week containing `today`. */
export function weekProgress(h: HabitLike, events: HabitDay[], today: ISODate): WeekProgress {
  const map = toMap(events);
  const ws = startOfWeek(today);
  const days = eachDay(ws, addDays(ws, 6));
  const done = days.reduce((s, d) => s + credit(map.get(d)?.status), 0);
  if (h.frequency === "weekly_count") return { done, expected: Math.max(1, h.weeklyTarget ?? 1) };
  const expected = days.filter((d) => isScheduled(h, d) && map.get(d)?.status !== "skipped").length;
  return { done, expected };
}

/** Days scheduled in the past (before today) that have no outcome — candidates for an explicit "missed" event. */
export function unresolvedDays(h: HabitLike, events: HabitDay[], from: ISODate, today: ISODate): ISODate[] {
  if (h.frequency === "weekly_count") return [];
  const map = toMap(events);
  return eachDay(from, addDays(today, -1)).filter((d) => isScheduled(h, d) && !map.has(d));
}
