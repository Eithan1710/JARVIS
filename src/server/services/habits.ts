import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { addDays, toLocalDate, type ISODate } from "@/lib/dates";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { goalHabits, habitEvents, habits } from "../db/schema";
import { badRequest, notFound } from "../api/handler";
import {
  completionRate,
  isScheduled,
  statusFromValue,
  streaks,
  unresolvedDays,
  weekProgress,
  type HabitDay,
  type HabitStatus,
} from "../analytics/habit-stats";
import type { FrameHabit } from "../analytics/dayframe";

export type HabitRow = typeof habits.$inferSelect;
export type HabitEventRow = typeof habitEvents.$inferSelect;

export const habitInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullish(),
  icon: z.string().max(8).nullish(),
  color: z.string().max(20).nullish(),
  tier: z.enum(["main", "side"]).default("main"),
  kind: z.enum(["boolean", "quantity"]).default("boolean"),
  unit: z.string().max(20).nullish(),
  targetValue: z.number().positive().nullish(),
  frequency: z.enum(["daily", "specific_days", "weekly_count"]).default("daily"),
  scheduleDays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  weeklyTarget: z.number().int().min(1).max(7).nullish(),
  preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  timeLabel: z.string().max(40).nullish(),
  reminderEnabled: z.boolean().default(false),
  metricKey: z.string().max(60).nullish(),
});
export const habitPatch = habitInput.partial().extend({ archived: z.boolean().optional(), sortOrder: z.number().int().optional() });

export const habitLogInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["completed", "partial", "missed", "skipped"]).nullable().optional(),
  value: z.number().min(0).max(1_000_000).nullish(),
  note: z.string().max(1000).nullish(),
  /** When the habit actually happened; defaults to now. */
  occurredAt: z.string().datetime().optional(),
  /** Explicitly clear the day's outcome (undo). */
  clear: z.boolean().optional(),
});

export function habitStartDate(h: HabitRow, tz: string): ISODate {
  return h.startDate ?? toLocalDate(h.createdAt, tz);
}

export function toFrameHabit(h: HabitRow, tz: string): FrameHabit {
  return {
    id: h.id,
    name: h.name,
    tier: h.tier,
    metricKey: h.metricKey,
    frequency: h.frequency,
    scheduleDays: h.scheduleDays ?? [0, 1, 2, 3, 4, 5, 6],
    weeklyTarget: h.weeklyTarget,
    kind: h.kind,
    targetValue: h.targetValue,
    startDate: habitStartDate(h, tz),
  };
}

export async function listHabits(ctx: UserContext, opts: { includeArchived?: boolean } = {}) {
  const db = await getDb();
  const where = opts.includeArchived
    ? eq(habits.userId, ctx.userId)
    : and(eq(habits.userId, ctx.userId), isNull(habits.archivedAt));
  return db.select().from(habits).where(where).orderBy(asc(habits.sortOrder), asc(habits.createdAt));
}

export async function getHabit(ctx: UserContext, id: string) {
  const db = await getDb();
  const [h] = await db.select().from(habits).where(and(eq(habits.id, id), eq(habits.userId, ctx.userId))).limit(1);
  if (!h) throw notFound("ההרגל");
  return h;
}

export async function habitEventsInRange(ctx: UserContext, from: ISODate, to: ISODate, habitIds?: string[]) {
  const db = await getDb();
  const conds = [eq(habitEvents.userId, ctx.userId), gte(habitEvents.date, from), lte(habitEvents.date, to)];
  if (habitIds?.length) conds.push(inArray(habitEvents.habitId, habitIds));
  return db.select().from(habitEvents).where(and(...conds)).orderBy(asc(habitEvents.date));
}

export async function createHabit(ctx: UserContext, input: z.infer<typeof habitInput>) {
  const db = await getDb();
  const existing = await listHabits(ctx);
  const [row] = await db
    .insert(habits)
    .values({
      ...input,
      userId: ctx.userId,
      scheduleDays: input.frequency === "specific_days" ? input.scheduleDays : [0, 1, 2, 3, 4, 5, 6],
      weeklyTarget: input.frequency === "weekly_count" ? (input.weeklyTarget ?? 3) : null,
      sortOrder: existing.length,
      startDate: ctx.today,
    })
    .returning();
  return row;
}

export async function updateHabit(ctx: UserContext, id: string, patch: z.infer<typeof habitPatch>) {
  await getHabit(ctx, id);
  const db = await getDb();
  const { archived, ...rest } = patch;
  const values: Partial<typeof habits.$inferInsert> = { ...rest };
  if (archived !== undefined) values.archivedAt = archived ? new Date() : null;
  const [row] = await db.update(habits).set(values).where(eq(habits.id, id)).returning();
  return row;
}

export async function deleteHabit(ctx: UserContext, id: string) {
  await getHabit(ctx, id);
  const db = await getDb();
  await db.delete(habits).where(eq(habits.id, id));
}

export async function reorderHabits(ctx: UserContext, ids: string[]) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(habits).set({ sortOrder: i }).where(and(eq(habits.id, ids[i]), eq(habits.userId, ctx.userId)));
    }
  });
}

/**
 * Record (or clear) the outcome of a habit for a date. Idempotent per (habit, date), so an
 * offline replay of the same action is harmless.
 */
export async function logHabit(ctx: UserContext, habitId: string, input: z.infer<typeof habitLogInput>) {
  const h = await getHabit(ctx, habitId);
  const db = await getDb();
  if (input.date > addDays(ctx.today, 1)) throw badRequest("אי אפשר לסמן הרגל לתאריך עתידי");
  if (input.clear) {
    await db.delete(habitEvents).where(and(eq(habitEvents.habitId, habitId), eq(habitEvents.date, input.date)));
    return null;
  }
  let status: HabitStatus = input.status ?? "completed";
  if (h.kind === "quantity" && input.value != null && !input.status) status = statusFromValue(h, input.value);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const values = {
    userId: ctx.userId,
    habitId,
    date: input.date,
    status,
    value: input.value ?? null,
    note: input.note ?? null,
    occurredAt,
    source: "manual",
  };
  const [row] = await db
    .insert(habitEvents)
    .values(values)
    .onConflictDoUpdate({
      target: [habitEvents.habitId, habitEvents.date],
      set: { status, value: values.value, note: values.note, occurredAt, source: "manual", updatedAt: new Date() },
    })
    .returning();
  return row;
}

export interface HabitSummary {
  habit: HabitRow;
  today: { date: ISODate; scheduled: boolean; status: HabitStatus | null; value: number | null };
  streak: { current: number; best: number; unit: "days" | "weeks" };
  week: { done: number; expected: number };
  rate7: number | null;
  rate30: number | null;
  rate90: number | null;
  recent: { date: ISODate; scheduled: boolean; status: HabitStatus | null; value: number | null }[];
  goalIds: string[];
}

/** Everything the UI needs for habit lists in one round trip. */
export async function habitSummaries(ctx: UserContext, opts: { date?: ISODate; recentDays?: number } = {}): Promise<HabitSummary[]> {
  const date = opts.date ?? ctx.today;
  const rows = await listHabits(ctx);
  if (!rows.length) return [];
  const historyFrom = addDays(ctx.today, -400);
  const events = await habitEventsInRange(ctx, historyFrom, addDays(ctx.today, 1));
  const db = await getDb();
  const links = await db.select().from(goalHabits).where(inArray(goalHabits.habitId, rows.map((r) => r.id)));
  const byHabit = new Map<string, HabitDay[]>();
  for (const e of events) {
    const arr = byHabit.get(e.habitId) ?? [];
    arr.push({ date: e.date, status: e.status, value: e.value });
    byHabit.set(e.habitId, arr);
  }
  const recentDays = opts.recentDays ?? 14;
  return rows.map((h) => {
    const fh = toFrameHabit(h, ctx.timezone);
    const evs = byHabit.get(h.id) ?? [];
    const evMap = new Map(evs.map((e) => [e.date, e]));
    const todayEv = evMap.get(date);
    const recent = [];
    for (let i = recentDays - 1; i >= 0; i--) {
      const d = addDays(date, -i);
      const ev = evMap.get(d);
      recent.push({ date: d, scheduled: isScheduled(fh, d), status: ev?.status ?? null, value: ev?.value ?? null });
    }
    return {
      habit: h,
      today: { date, scheduled: isScheduled(fh, date), status: todayEv?.status ?? null, value: todayEv?.value ?? null },
      streak: streaks(fh, evs, ctx.today),
      week: weekProgress(fh, evs, date),
      rate7: completionRate(fh, evs, addDays(ctx.today, -6), ctx.today, ctx.today).rate,
      rate30: completionRate(fh, evs, addDays(ctx.today, -29), ctx.today, ctx.today).rate,
      rate90: completionRate(fh, evs, addDays(ctx.today, -89), ctx.today, ctx.today).rate,
      recent,
      goalIds: links.filter((l) => l.habitId === h.id).map((l) => l.goalId),
    };
  });
}

/** Detailed history for a single habit (calendar heatmap + stats). */
export async function habitDetail(ctx: UserContext, id: string, days = 365) {
  const h = await getHabit(ctx, id);
  const fh = toFrameHabit(h, ctx.timezone);
  const from = addDays(ctx.today, -(days - 1));
  const evs = await habitEventsInRange(ctx, from < fh.startDate ? fh.startDate : from, ctx.today, [id]);
  const hd: HabitDay[] = evs.map((e) => ({ date: e.date, status: e.status, value: e.value }));
  // Typical time of completion (local), from actual events.
  const minutes = evs
    .filter((e) => e.status === "completed" && e.source === "manual")
    .map((e) => {
      const d = new Date(e.occurredAt);
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ctx.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
      const [hh, mm] = parts.split(":").map(Number);
      return hh * 60 + mm;
    });
  const byWeekday = [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const ds = hd.filter((e) => new Date(`${e.date}T00:00:00Z`).getUTCDay() === wd);
    const done = ds.filter((e) => e.status === "completed" || e.status === "partial").length;
    const resolved = ds.filter((e) => e.status !== "skipped").length;
    return { weekday: wd, done, total: resolved, rate: resolved ? done / resolved : null };
  });
  return {
    habit: h,
    events: evs.map((e) => ({ date: e.date, status: e.status, value: e.value, note: e.note, occurredAt: e.occurredAt, source: e.source })),
    streak: streaks(fh, hd, ctx.today),
    week: weekProgress(fh, hd, ctx.today),
    rates: {
      d7: completionRate(fh, hd, addDays(ctx.today, -6), ctx.today, ctx.today),
      d30: completionRate(fh, hd, addDays(ctx.today, -29), ctx.today, ctx.today),
      d90: completionRate(fh, hd, addDays(ctx.today, -89), ctx.today, ctx.today),
      d365: completionRate(fh, hd, addDays(ctx.today, -364), ctx.today, ctx.today),
    },
    typicalMinutes: minutes.length ? minutes.sort((a, b) => a - b)[Math.floor(minutes.length / 2)] : null,
    byWeekday,
    startDate: fh.startDate,
  };
}

/**
 * Close out past days: write explicit "missed" events for scheduled days with no outcome.
 * Makes the history explicit instead of relying on absence. Idempotent.
 */
export async function closeOutMissedDays(ctx: UserContext, lookbackDays = 7) {
  const db = await getDb();
  const rows = await listHabits(ctx);
  const from = addDays(ctx.today, -lookbackDays);
  const events = await habitEventsInRange(ctx, from, ctx.today);
  let inserted = 0;
  for (const h of rows) {
    const fh = toFrameHabit(h, ctx.timezone);
    const evs: HabitDay[] = events.filter((e) => e.habitId === h.id).map((e) => ({ date: e.date, status: e.status }));
    const missing = unresolvedDays(fh, evs, from > fh.startDate ? from : fh.startDate, ctx.today);
    if (!missing.length) continue;
    const res = await db
      .insert(habitEvents)
      .values(missing.map((date) => ({ userId: ctx.userId, habitId: h.id, date, status: "missed" as const, source: "system", occurredAt: new Date() })))
      .onConflictDoNothing()
      .returning({ id: habitEvents.id });
    inserted += res.length;
  }
  return inserted;
}
