import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { type ISODate, toLocalDate, weekday } from "@/lib/dates";
import { METRIC_MAP } from "@/lib/metrics";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { calendarEvents, habitEvents, habits, metricDefinitions, metrics, transactions } from "../db/schema";
import { notFound } from "../api/handler";
import { statusFromValue } from "../analytics/habit-stats";

export const metricInput = z.object({
  metricKey: z.string().trim().min(1).max(60),
  value: z.number().finite(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startAt: z.string().datetime().nullish(),
  endAt: z.string().datetime().nullish(),
  note: z.string().max(500).nullish(),
  meta: z.record(z.string(), z.unknown()).optional(),
  clientId: z.string().uuid().optional(),
});

export async function addMetric(ctx: UserContext, input: z.infer<typeof metricInput>, source = "manual") {
  const db = await getDb();
  const def = METRIC_MAP.get(input.metricKey);
  const { clientId, ...rest } = input;
  const [row] = await db
    .insert(metrics)
    .values({
      ...(clientId ? { id: clientId } : {}),
      userId: ctx.userId,
      metricKey: rest.metricKey,
      value: rest.value,
      unit: def?.unit ?? null,
      date: rest.date,
      startAt: rest.startAt ? new Date(rest.startAt) : null,
      endAt: rest.endAt ? new Date(rest.endAt) : null,
      note: rest.note ?? null,
      meta: rest.meta ?? {},
      source,
    })
    .onConflictDoNothing()
    .returning();
  await syncHabitsFromMetrics(ctx, [input.date]);
  return row ?? null;
}

export async function deleteMetric(ctx: UserContext, id: string) {
  const db = await getDb();
  const [row] = await db.delete(metrics).where(and(eq(metrics.id, id), eq(metrics.userId, ctx.userId))).returning();
  if (!row) throw notFound("הנתון");
  await syncHabitsFromMetrics(ctx, [row.date]);
}

export async function listMetrics(ctx: UserContext, opts: { from?: ISODate; to?: ISODate; keys?: string[]; source?: string; limit?: number }) {
  const db = await getDb();
  const conds = [eq(metrics.userId, ctx.userId)];
  if (opts.from) conds.push(gte(metrics.date, opts.from));
  if (opts.to) conds.push(lte(metrics.date, opts.to));
  if (opts.keys?.length) conds.push(inArray(metrics.metricKey, opts.keys));
  if (opts.source) conds.push(eq(metrics.source, opts.source));
  return db
    .select()
    .from(metrics)
    .where(and(...conds))
    .orderBy(desc(metrics.date), desc(metrics.createdAt))
    .limit(opts.limit ?? 500);
}

/** Metric keys with data, with counts and date range — powers the "my data" overview. */
export async function metricInventory(ctx: UserContext) {
  const db = await getDb();
  return db
    .select({
      metricKey: metrics.metricKey,
      count: sql<number>`count(*)::int`,
      first: sql<string>`min(${metrics.date})::text`,
      last: sql<string>`max(${metrics.date})::text`,
      sources: sql<string[]>`array_agg(distinct ${metrics.source})`,
    })
    .from(metrics)
    .where(eq(metrics.userId, ctx.userId))
    .groupBy(metrics.metricKey)
    .orderBy(asc(metrics.metricKey));
}

export async function customMetricDefs(ctx: UserContext) {
  const db = await getDb();
  return db.select().from(metricDefinitions).where(eq(metricDefinitions.userId, ctx.userId));
}

export const customMetricInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1).max(40),
  unit: z.string().max(12).nullish(),
  category: z.string().max(20).default("other"),
  aggregation: z.enum(["sum", "avg", "last", "max"]).default("sum"),
  higherIsBetter: z.boolean().nullish(),
});

export async function createCustomMetric(ctx: UserContext, input: z.infer<typeof customMetricInput>) {
  const db = await getDb();
  const [row] = await db.insert(metricDefinitions).values({ ...input, userId: ctx.userId }).onConflictDoNothing().returning();
  return row;
}

/**
 * When a metric is linked to a habit (habit.metricKey), fill the habit outcome from data —
 * but never override something the user marked by hand.
 */
export async function syncHabitsFromMetrics(ctx: UserContext, dates: ISODate[]) {
  if (!dates.length) return;
  const db = await getDb();
  const linked = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, ctx.userId), isNull(habits.archivedAt), sql`${habits.metricKey} is not null`));
  if (!linked.length) return;
  const keys = [...new Set(linked.map((h) => h.metricKey!))];
  const rows = await db
    .select({ metricKey: metrics.metricKey, date: metrics.date, value: metrics.value })
    .from(metrics)
    .where(and(eq(metrics.userId, ctx.userId), inArray(metrics.metricKey, keys), inArray(metrics.date, dates)));
  for (const h of linked) {
    for (const date of dates) {
      // Only days the habit is actually planned for (a Friday run must not tick a Sun–Thu gym habit).
      if (h.frequency === "specific_days" && !(h.scheduleDays ?? []).includes(weekday(date))) continue;
      const vals = rows.filter((r) => r.metricKey === h.metricKey && r.date === date).map((r) => r.value);
      const [existing] = await db
        .select()
        .from(habitEvents)
        .where(and(eq(habitEvents.habitId, h.id), eq(habitEvents.date, date)))
        .limit(1);
      if (existing && existing.source === "manual") continue;
      if (!vals.length) {
        if (existing && existing.source === "metric") await db.delete(habitEvents).where(eq(habitEvents.id, existing.id));
        continue;
      }
      const agg = METRIC_MAP.get(h.metricKey!)?.aggregation ?? "sum";
      const value = agg === "sum" ? vals.reduce((a, b) => a + b, 0) : agg === "max" ? Math.max(...vals) : vals[vals.length - 1];
      const status = h.kind === "quantity" ? statusFromValue(h, value) : value > 0 ? "completed" : "missed";
      await db
        .insert(habitEvents)
        .values({ userId: ctx.userId, habitId: h.id, date, status, value, source: "metric" })
        .onConflictDoUpdate({ target: [habitEvents.habitId, habitEvents.date], set: { status, value, source: "metric", updatedAt: new Date() } });
    }
  }
}

/* ------------------------------ Transactions ------------------------------ */

export const transactionInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite().min(-1_000_000).max(1_000_000),
  currency: z.string().length(3).default("ILS"),
  category: z.string().max(30).default("other"),
  description: z.string().max(200).nullish(),
  merchant: z.string().max(120).nullish(),
  clientId: z.string().uuid().optional(),
});

export async function addTransaction(ctx: UserContext, input: z.infer<typeof transactionInput>, source = "manual") {
  const db = await getDb();
  const { clientId, ...rest } = input;
  const [row] = await db
    .insert(transactions)
    .values({ ...(clientId ? { id: clientId } : {}), ...rest, amount: Math.round(rest.amount * 100) / 100, userId: ctx.userId, source })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function deleteTransaction(ctx: UserContext, id: string) {
  const db = await getDb();
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, ctx.userId)));
}

export async function listTransactions(ctx: UserContext, opts: { from?: ISODate; to?: ISODate; category?: string; limit?: number }) {
  const db = await getDb();
  const conds = [eq(transactions.userId, ctx.userId)];
  if (opts.from) conds.push(gte(transactions.date, opts.from));
  if (opts.to) conds.push(lte(transactions.date, opts.to));
  if (opts.category) conds.push(eq(transactions.category, opts.category));
  return db.select().from(transactions).where(and(...conds)).orderBy(desc(transactions.date)).limit(opts.limit ?? 500);
}

export async function spendingByCategory(ctx: UserContext, from: ISODate, to: ISODate) {
  const db = await getDb();
  return db
    .select({ category: transactions.category, total: sql<number>`sum(${transactions.amount})::float8`, count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, ctx.userId), gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.category)
    .orderBy(desc(sql`sum(${transactions.amount})`));
}

/* ------------------------------ Calendar ------------------------------ */

export const calendarInput = z.object({
  title: z.string().trim().min(1).max(200),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().default(false),
  location: z.string().max(200).nullish(),
  kind: z.enum(["meeting", "personal", "focus", "other"]).default("meeting"),
});

export async function addCalendarEvent(ctx: UserContext, input: z.infer<typeof calendarInput>) {
  const db = await getDb();
  const [row] = await db
    .insert(calendarEvents)
    .values({ ...input, startAt: new Date(input.startAt), endAt: new Date(input.endAt), userId: ctx.userId, source: "manual" })
    .returning();
  return row;
}

export async function listCalendar(ctx: UserContext, fromInstant: Date, toInstant: Date) {
  const db = await getDb();
  return db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, ctx.userId), gte(calendarEvents.endAt, fromInstant), lte(calendarEvents.startAt, toInstant)))
    .orderBy(asc(calendarEvents.startAt));
}

export async function deleteCalendarEvent(ctx: UserContext, id: string) {
  const db = await getDb();
  await db.delete(calendarEvents).where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, ctx.userId)));
}

export function calendarDayOf(ctx: UserContext, e: { startAt: Date }): ISODate {
  return toLocalDate(e.startAt, ctx.timezone);
}
