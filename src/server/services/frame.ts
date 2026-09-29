import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { addDays, zonedTime, type ISODate } from "@/lib/dates";
import type { Aggregation } from "@/lib/metrics";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { calendarEvents, dailyCheckins, habitEvents, integrations, journalEntries, metrics, transactions } from "../db/schema";
import { buildFrame, type DayRow } from "../analytics/dayframe";
import { customMetricDefs } from "./data";
import { listHabits, toFrameHabit } from "./habits";

export interface LoadedFrame {
  frame: DayRow[];
  habitNames: Map<string, string>;
  custom: Map<string, { label: string; unit: string | null }>;
  from: ISODate;
  to: ISODate;
}

/** Load every signal for [from, to] and align it into a Day Frame. */
export async function loadFrame(ctx: UserContext, from: ISODate, to: ISODate): Promise<LoadedFrame> {
  const db = await getDb();
  const [habitRows, evs, checkins, metricRows, tx, cal, journal, calendarIntegrations, customDefs] = await Promise.all([
    listHabits(ctx, { includeArchived: true }),
    db
      .select({ habitId: habitEvents.habitId, date: habitEvents.date, status: habitEvents.status, value: habitEvents.value })
      .from(habitEvents)
      .where(and(eq(habitEvents.userId, ctx.userId), gte(habitEvents.date, from), lte(habitEvents.date, to))),
    db
      .select({ date: dailyCheckins.date, mood: dailyCheckins.mood, energy: dailyCheckins.energy, focus: dailyCheckins.focus })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, ctx.userId), gte(dailyCheckins.date, from), lte(dailyCheckins.date, to))),
    db
      .select({ metricKey: metrics.metricKey, date: metrics.date, value: metrics.value })
      .from(metrics)
      .where(and(eq(metrics.userId, ctx.userId), gte(metrics.date, from), lte(metrics.date, to))),
    db
      .select({ date: transactions.date, amount: transactions.amount, category: transactions.category })
      .from(transactions)
      .where(and(eq(transactions.userId, ctx.userId), gte(transactions.date, from), lte(transactions.date, to))),
    db
      .select({ startAt: calendarEvents.startAt, endAt: calendarEvents.endAt, allDay: calendarEvents.allDay, kind: calendarEvents.kind })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, ctx.userId),
          gte(calendarEvents.startAt, zonedTime(from, "00:00", ctx.timezone)),
          lte(calendarEvents.startAt, zonedTime(addDays(to, 1), "00:00", ctx.timezone)),
        ),
      ),
    db
      .select({ date: journalEntries.date })
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, ctx.userId), gte(journalEntries.date, from), lte(journalEntries.date, to))),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(integrations)
      .where(and(eq(integrations.userId, ctx.userId), eq(integrations.provider, "ics_calendar"), eq(integrations.status, "active"))),
    customMetricDefs(ctx),
  ]);

  // Archived habits still contribute history for the period they existed.
  const frameHabits = habitRows.map((h) => toFrameHabit(h, ctx.timezone));
  const calendarTracked = (calendarIntegrations[0]?.c ?? 0) > 0 || cal.length > 0;

  const frame = buildFrame({
    from,
    to,
    today: ctx.today,
    timezone: ctx.timezone,
    habits: frameHabits.filter((h) => !habitRows.find((r) => r.id === h.id)?.archivedAt),
    habitEvents: evs,
    checkins,
    metrics: metricRows,
    customAggregations: Object.fromEntries(customDefs.map((d) => [d.key, d.aggregation as Aggregation])),
    transactions: tx,
    calendar: cal,
    calendarTracked,
    journalDates: journal.map((j) => j.date),
  });

  return {
    frame,
    habitNames: new Map(habitRows.map((h) => [h.id, h.name])),
    custom: new Map(customDefs.map((d) => [d.key, { label: d.label, unit: d.unit }])),
    from,
    to,
  };
}
