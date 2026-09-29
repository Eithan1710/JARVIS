import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { addDays, localParts, zonedTime } from "@/lib/dates";
import { greeting } from "@/lib/format";
import { mergeSettings, type SettingsPatch } from "@/lib/settings";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import {
  aiConversations,
  aiTasks,
  calendarEvents,
  dailyCheckins,
  experiments,
  goals,
  habitEvents,
  habits,
  importedRecords,
  insights,
  integrations,
  journalEntries,
  memories,
  metrics,
  notifications,
  pushSubscriptions,
  transactions,
  users,
} from "../db/schema";
import { availableProviders } from "../ai/router";
import { pushConfigured } from "../notifications/push";
import { env } from "../env";
import { makeLookup } from "../analytics/compare";
import { habitSummaries } from "./habits";
import { listGoals } from "./goals";
import { listInsights } from "./insights";
import { getCheckin } from "./journal";
import { listCalendar } from "./data";
import { loadFrame } from "./frame";
import { hasDemoData } from "./demo";

/** Everything the home screen needs, in one round trip (important on mobile). */
export async function dashboard(ctx: UserContext) {
  const local = localParts(ctx.now, ctx.timezone);
  const from = addDays(ctx.today, -13);
  const [summaries, goalViews, topInsights, checkin, loaded, events, demo, pending] = await Promise.all([
    habitSummaries(ctx),
    listGoals(ctx, { status: "active" }),
    listInsights(ctx, { limit: 4 }),
    getCheckin(ctx, ctx.today),
    loadFrame(ctx, from, ctx.today),
    listCalendar(ctx, zonedTime(ctx.today, "00:00", ctx.timezone), zonedTime(addDays(ctx.today, 2), "00:00", ctx.timezone)),
    hasDemoData(ctx),
    upcomingReminders(ctx),
  ]);
  const lookup = makeLookup(loaded.habitNames, loaded.custom);
  const series = (key: string) => loaded.frame.map((r) => ({ date: r.date, value: r.v[key] ?? null }));
  const today = loaded.frame.find((r) => r.date === ctx.today);
  const yesterday = loaded.frame.find((r) => r.date === addDays(ctx.today, -1));
  return {
    greeting: greeting(local.hour),
    displayName: ctx.displayName,
    today: ctx.today,
    now: ctx.now.toISOString(),
    habits: summaries.map((s) => ({
      id: s.habit.id,
      name: s.habit.name,
      icon: s.habit.icon,
      tier: s.habit.tier,
      kind: s.habit.kind,
      unit: s.habit.unit,
      targetValue: s.habit.targetValue,
      frequency: s.habit.frequency,
      timeLabel: s.habit.timeLabel,
      metricKey: s.habit.metricKey,
      today: s.today,
      streak: s.streak,
      week: s.week,
      rate30: s.rate30,
      recent: s.recent.slice(-7),
    })),
    checkin,
    todayValues: {
      sleep: today?.v.sleep_hours ?? null,
      steps: today?.v.steps ?? null,
      workoutMinutes: today?.v.workout_minutes ?? null,
      workHours: today?.v.work_hours ?? null,
      spending: today?.v.spending ?? null,
      meetings: today?.v.meetings ?? null,
    },
    yesterday: yesterday ? { habitsDone: yesterday.v.habits_done ?? null, habitsDue: yesterday.v.habits_due ?? null, mainRate: yesterday.v.main_habit_rate ?? null } : null,
    trends: {
      sleep: series("sleep_hours"),
      habitRate: series("habit_rate"),
      mood: series("mood"),
      energy: series("energy"),
      focus: series("focus"),
      steps: series("steps"),
    },
    labels: { sleep: lookup("sleep_hours").label },
    goals: goalViews.slice(0, 4).map((g) => ({ id: g.goal.id, title: g.goal.title, progress: g.progress, progressLabel: g.progressLabel, daysLeft: g.daysLeft, expected: g.expectedProgress })),
    insights: topInsights.slice(0, 3).map((i) => ({ id: i.id, title: i.title, summary: i.summary, confidence: i.confidence, kind: i.kind, evidenceLevel: i.evidenceLevel, status: i.status })),
    events: events.map((e) => ({ id: e.id, title: e.title, startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString(), allDay: e.allDay })),
    reminders: pending,
    aiConfigured: availableProviders().length > 0 && ctx.settings.ai.enabled,
    hasDemoData: demo,
    onboarded: ctx.settings.onboarded,
  };
}

async function upcomingReminders(ctx: UserContext) {
  const db = await getDb();
  const rows = await db
    .select({ id: notifications.id, title: notifications.title, scheduledFor: notifications.scheduledFor, kind: notifications.kind, reason: notifications.reason })
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.userId), eq(notifications.status, "pending"), gte(notifications.scheduledFor, ctx.now), sql`${notifications.scheduledFor} < ${zonedTime(addDays(ctx.today, 1), "00:00", ctx.timezone)}`))
    .orderBy(notifications.scheduledFor)
    .limit(5);
  return rows.map((r) => ({ ...r, scheduledFor: r.scheduledFor.toISOString() }));
}

/* ------------------------------------------------------------------ */
/* Settings & system status                                            */
/* ------------------------------------------------------------------ */

export async function updateSettings(ctx: UserContext, patch: SettingsPatch) {
  const db = await getDb();
  const next = mergeSettings(ctx.settings, patch.settings);
  const [row] = await db
    .update(users)
    .set({
      settings: next as unknown as Record<string, unknown>,
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.timezone ? { timezone: patch.timezone } : {}),
    })
    .where(eq(users.id, ctx.userId))
    .returning();
  return { displayName: row.displayName, timezone: row.timezone, settings: next };
}

export async function systemStatus(ctx: UserContext) {
  const db = await getDb();
  const [subs] = await db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, ctx.userId));
  const recentTasks = await db.select().from(aiTasks).where(eq(aiTasks.userId, ctx.userId)).orderBy(desc(aiTasks.createdAt)).limit(25);
  return {
    ai: {
      providers: availableProviders().map((p) => ({ id: p.id, label: p.label, fast: p.modelFor("fast"), deep: p.modelFor("deep"), privacyNote: p.privacyNote })),
      enabled: ctx.settings.ai.enabled,
    },
    push: { configured: pushConfigured(), publicKey: env().VAPID_PUBLIC_KEY ?? null, devices: subs.n },
    database: env().DATABASE_URL ? "postgres" : "embedded",
    auth: Boolean(env().APP_PASSCODE),
    cron: Boolean(env().CRON_SECRET),
    aiLog: recentTasks.map((t) => ({ id: t.id, type: t.type, status: t.status, provider: t.provider, model: t.model, tier: t.tier, dataScope: t.dataScope, contextChars: t.contextChars, latencyMs: t.latencyMs, at: t.createdAt.toISOString(), error: t.error })),
  };
}

/* ------------------------------------------------------------------ */
/* Data inventory, provenance, export, erase                           */
/* ------------------------------------------------------------------ */

export async function dataInventory(ctx: UserContext) {
  const db = await getDb();
  const u = ctx.userId;
  const c = async (t: PgTable, col: AnyPgColumn) =>
    (await db.select({ n: count() }).from(t).where(eq(col, u)))[0].n;
  const [nh, ng, nj, nc, nt, ncal, nm, ni, nr, ne, nconv, nint] = await Promise.all([
    c(habits, habits.userId),
    c(goals, goals.userId),
    c(journalEntries, journalEntries.userId),
    c(dailyCheckins, dailyCheckins.userId),
    c(transactions, transactions.userId),
    c(calendarEvents, calendarEvents.userId),
    c(memories, memories.userId),
    c(insights, insights.userId),
    c(importedRecords, importedRecords.userId),
    c(experiments, experiments.userId),
    c(aiConversations, aiConversations.userId),
    c(integrations, integrations.userId),
  ]);
  const [he] = await db.select({ n: count() }).from(habitEvents).where(eq(habitEvents.userId, u));
  const metricKeys = await db
    .select({ metricKey: metrics.metricKey, n: sql<number>`count(*)::int`, first: sql<string>`min(${metrics.date})::text`, last: sql<string>`max(${metrics.date})::text`, sources: sql<string[]>`array_agg(distinct ${metrics.source})` })
    .from(metrics)
    .where(eq(metrics.userId, u))
    .groupBy(metrics.metricKey);
  return {
    counts: { habits: nh, habitEvents: he.n, goals: ng, journal: nj, checkins: nc, transactions: nt, calendar: ncal, memories: nm, insights: ni, importedRecords: nr, experiments: ne, conversations: nconv, integrations: nint },
    metrics: metricKeys,
  };
}

export async function metricProvenance(ctx: UserContext, id: string) {
  const db = await getDb();
  const [m] = await db.select().from(metrics).where(and(eq(metrics.id, id), eq(metrics.userId, ctx.userId))).limit(1);
  if (!m) return null;
  const raw = m.sourceRecordId ? (await db.select().from(importedRecords).where(eq(importedRecords.id, m.sourceRecordId)).limit(1))[0] : null;
  return { record: m, imported: raw ?? null };
}

export async function exportAll(ctx: UserContext) {
  const db = await getDb();
  const u = ctx.userId;
  const [h, he, g, j, dc, m, t, cal, mem, ins, exp, conv] = await Promise.all([
    db.select().from(habits).where(eq(habits.userId, u)),
    db.select().from(habitEvents).where(eq(habitEvents.userId, u)),
    db.select().from(goals).where(eq(goals.userId, u)),
    db.select().from(journalEntries).where(eq(journalEntries.userId, u)),
    db.select().from(dailyCheckins).where(eq(dailyCheckins.userId, u)),
    db.select().from(metrics).where(eq(metrics.userId, u)),
    db.select().from(transactions).where(eq(transactions.userId, u)),
    db.select().from(calendarEvents).where(eq(calendarEvents.userId, u)),
    db.select().from(memories).where(eq(memories.userId, u)),
    db.select().from(insights).where(eq(insights.userId, u)),
    db.select().from(experiments).where(eq(experiments.userId, u)),
    db.select().from(aiConversations).where(eq(aiConversations.userId, u)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    format: "nova-export-v1",
    profile: { displayName: ctx.displayName, timezone: ctx.timezone, settings: ctx.settings },
    habits: h,
    habitEvents: he,
    goals: g,
    journal: j,
    checkins: dc,
    metrics: m,
    transactions: t,
    calendar: cal,
    memories: mem,
    insights: ins,
    experiments: exp,
    conversations: conv,
  };
}

/** Irreversible. Removes every personal row; keeps the owner row so the app still opens. */
export async function eraseAll(ctx: UserContext) {
  const db = await getDb();
  const u = ctx.userId;
  await db.transaction(async (tx) => {
    for (const t of [habitEvents, metrics, transactions, calendarEvents, dailyCheckins, journalEntries, memories, insights, experiments, notifications, aiConversations, aiTasks, importedRecords, integrations, pushSubscriptions, goals, habits]) {
      await tx.delete(t).where(eq((t as typeof habits).userId, u));
    }
  });
}
