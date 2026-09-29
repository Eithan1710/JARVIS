import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, eachDay, endOfMonth, localParts, startOfWeek, weekday, zonedTime } from "@/lib/dates";
import { completionRate, streaks, weekProgress, unresolvedDays, statusFromValue, type HabitLike } from "@/server/analytics/habit-stats";
import { changePoint, cohensD, compareGroups, linearTrend, mean, median, pearson, spearman } from "@/server/analytics/stats";
import { assessConfidence } from "@/server/analytics/confidence";
import { decideHabitReminder, budgetAllows, mergeBlocks, inQuiet } from "@/server/notifications/engine";
import { bedtimeFromClock, bedtimeToClock } from "@/lib/metrics";
import { parseSettings, mergeSettings } from "@/lib/settings";

describe("dates", () => {
  it("does calendar arithmetic on ISO dates", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(diffDays("2026-10-01", "2026-09-29")).toBe(2);
    expect(eachDay("2026-09-28", "2026-09-30")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(weekday("2026-09-29")).toBe(2); // Tuesday
    expect(startOfWeek("2026-09-29")).toBe("2026-09-27"); // Sunday
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("converts between zones (DST-aware)", () => {
    const t = zonedTime("2026-09-29", "18:00", "Asia/Jerusalem");
    expect(t.toISOString()).toBe("2026-09-29T15:00:00.000Z");
    const w = zonedTime("2026-01-15", "18:00", "Asia/Jerusalem");
    expect(w.toISOString()).toBe("2026-01-15T16:00:00.000Z");
    expect(localParts(new Date("2026-09-29T21:30:00Z"), "Asia/Jerusalem").date).toBe("2026-09-30");
  });
  it("encodes bedtime across midnight", () => {
    expect(bedtimeFromClock("23:30")).toBeLessThan(bedtimeFromClock("00:30"));
    expect(bedtimeToClock(bedtimeFromClock("01:15"))).toBe("01:15");
  });
});

const daily: HabitLike = { id: "h", frequency: "daily", scheduleDays: [0, 1, 2, 3, 4, 5, 6], weeklyTarget: null, kind: "boolean", targetValue: null, startDate: "2026-09-01" };

describe("habit stats", () => {
  const ev = (d: string, s: "completed" | "missed" | "skipped" | "partial") => ({ date: d, status: s });
  it("does not penalise today before it happens", () => {
    const r = completionRate(daily, [ev("2026-09-28", "completed")], "2026-09-28", "2026-09-29", "2026-09-29");
    expect(r).toMatchObject({ rate: 1, expected: 1 });
  });
  it("ignores skipped days and counts partial as half", () => {
    const r = completionRate(daily, [ev("2026-09-26", "partial"), ev("2026-09-27", "skipped"), ev("2026-09-28", "completed")], "2026-09-26", "2026-09-28", "2026-09-29");
    expect(r.expected).toBe(2);
    expect(r.rate).toBeCloseTo(0.75);
  });
  it("computes streaks across skipped days", () => {
    const s = streaks(daily, [ev("2026-09-25", "missed"), ev("2026-09-26", "completed"), ev("2026-09-27", "skipped"), ev("2026-09-28", "completed")], "2026-09-29");
    expect(s.current).toBe(2);
  });
  it("handles specific-day schedules", () => {
    const gym: HabitLike = { ...daily, frequency: "specific_days", scheduleDays: [0, 1, 3, 4] };
    const r = completionRate(gym, [ev("2026-09-27", "completed"), ev("2026-09-28", "missed")], "2026-09-27", "2026-09-29", "2026-09-29");
    expect(r.expected).toBe(2); // Sun, Mon (Tue not scheduled)
    expect(unresolvedDays(gym, [], "2026-09-20", "2026-09-29")).toEqual(["2026-09-20", "2026-09-21", "2026-09-23", "2026-09-24", "2026-09-27", "2026-09-28"]);
  });
  it("tracks weekly-count habits by complete weeks", () => {
    const w: HabitLike = { ...daily, frequency: "weekly_count", weeklyTarget: 2 };
    const evs = [ev("2026-09-14", "completed"), ev("2026-09-16", "completed"), ev("2026-09-22", "completed")];
    const r = completionRate(w, evs, "2026-09-13", "2026-09-26", "2026-09-29");
    expect(r).toMatchObject({ expected: 4, done: 3 });
    expect(weekProgress(w, [ev("2026-09-28", "completed")], "2026-09-29")).toEqual({ done: 1, expected: 2 });
    expect(streaks(w, evs, "2026-09-29").unit).toBe("weeks");
  });
  it("derives status from quantity", () => {
    expect(statusFromValue({ kind: "quantity", targetValue: 7000 }, 8000)).toBe("completed");
    expect(statusFromValue({ kind: "quantity", targetValue: 7000 }, 3000)).toBe("partial");
  });
});

describe("stats", () => {
  it("basic summaries ignore nulls", () => {
    expect(mean([1, null, 3])).toBe(2);
    expect(median([5, 1, 3, null])).toBe(3);
  });
  it("correlations", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8]).r).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [10, 20, 25, 100]).r).toBeCloseTo(1);
    expect(pearson([1, 2], [1, 2]).r).toBeNull();
  });
  it("effect size and group comparisons", () => {
    const d = cohensD([8, 9, 8, 9, 8], [5, 6, 5, 6, 5]);
    expect(d).toBeGreaterThan(2);
    const c = compareGroups([8, 9, 8], [5, 6, 5]);
    expect(c.diff).toBeCloseTo(3);
  });
  it("trend and change point", () => {
    expect(linearTrend([1, 2, 3, 4, 5]).slope).toBeCloseTo(1);
    const series = [...Array(12).fill(5), ...Array(12).fill(8)].map((v, i) => v + (i % 2) * 0.3);
    const cp = changePoint(series, 7);
    expect(cp?.index).toBe(12);
  });
});

describe("confidence", () => {
  it("never claims confidence on tiny samples", () => {
    expect(assessConfidence({ n: 6, effect: 2, effectType: "d" }).level).toBe("insufficient");
    expect(assessConfidence({ n: 40, groups: [20, 20], effect: 1, effectType: "d" }).level).toBe("high");
    expect(assessConfidence({ n: 40, groups: [20, 20], effect: 0.3, effectType: "d" }).level).toBe("low");
    expect(assessConfidence({ n: 27, groups: [12, 15], effect: 0.9, effectType: "d" }).reason).toContain("27");
  });
});

describe("reminder engine", () => {
  const base = {
    habit: { id: "g", name: "חדר כושר", preferredTime: "19:00", frequency: "specific_days" as const, tier: "main" as const },
    nowMinutes: 9 * 60,
    isWeekend: false,
    doneToday: false,
    dueToday: true,
    history: [] as { minutes: number; weekend: boolean; busy: boolean }[],
    busy: [] as { start: number; end: number }[],
    quiet: { start: 22 * 60 + 30, end: 7 * 60 + 30 },
    ignoredRecently: 0,
  };
  it("uses the preferred time with a lead", () => {
    const d = decideHabitReminder(base);
    expect(d.action).toBe("schedule");
    expect(d.at).toBe(19 * 60 - 20);
  });
  it("moves the reminder after a busy calendar block using busy-day history", () => {
    const history = [...Array(6)].map(() => ({ minutes: 19 * 60, weekend: false, busy: false })).concat([...Array(4)].map(() => ({ minutes: 20 * 60 + 30, weekend: false, busy: true })));
    const d = decideHabitReminder({ ...base, history, busy: [{ start: 18 * 60, end: 20 * 60 }] });
    expect(d.at).toBe(20 * 60 + 10);
    expect(d.basis).toBe("learned_busy");
  });
  it("skips when done, not due, or ignored repeatedly", () => {
    expect(decideHabitReminder({ ...base, doneToday: true }).action).toBe("skip");
    expect(decideHabitReminder({ ...base, dueToday: false }).action).toBe("skip");
    expect(decideHabitReminder({ ...base, ignoredRecently: 3 }).action).toBe("skip");
  });
  it("respects budgets and quiet hours", () => {
    expect(budgetAllows({ sentToday: 3, lastSentMinutesAgo: 200, maxPerDay: 3, minGapMinutes: 90 }).ok).toBe(false);
    expect(budgetAllows({ sentToday: 1, lastSentMinutesAgo: 30, maxPerDay: 3, minGapMinutes: 90 }).ok).toBe(false);
    expect(inQuiet(23 * 60, base.quiet)).toBe(true);
    expect(inQuiet(12 * 60, base.quiet)).toBe(false);
    expect(mergeBlocks([{ start: 60, end: 120 }, { start: 125, end: 200 }])).toEqual([{ start: 60, end: 200 }]);
  });
});

describe("settings", () => {
  it("fills defaults and merges partial patches", () => {
    const s = parseSettings({ notifications: { maxPerDay: 5 } });
    expect(s.notifications.maxPerDay).toBe(5);
    expect(s.notifications.quietStart).toBe("22:30");
    const m = mergeSettings(s, { ai: { enabled: false } });
    expect(m.ai.enabled).toBe(false);
    expect(m.ai.shareJournalText).toBe(true);
    expect(parseSettings("garbage").proactivity).toBe("balanced");
  });
});
