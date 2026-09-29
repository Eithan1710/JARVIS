import "server-only";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { addDays, hhmmToMinutes, localParts, minutesToHHMM, startOfWeek, weekday, zonedTime } from "@/lib/dates";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { calendarEvents, dailyCheckins, habitEvents, insights, notificationEvents, notifications } from "../db/schema";
import { logger } from "../logger";
import { budgetAllows, decideHabitReminder, type Block } from "./engine";
import { sendPushToUser } from "./push";
import { habitSummaries } from "../services/habits";

const log = logger("notify");

type Row = typeof notifications.$inferSelect;

interface Candidate {
  kind: string;
  dedupeKey: string;
  title: string;
  body: string;
  url: string;
  at: number; // local minutes
  reason: Record<string, unknown>;
  habitId?: string;
  priority: "high" | "normal";
  skip?: boolean;
}

async function upsertCandidate(ctx: UserContext, c: Candidate) {
  const db = await getDb();
  const scheduledFor = zonedTime(ctx.today, minutesToHHMM(c.at), ctx.timezone);
  const [existing] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.userId), eq(notifications.dedupeKey, c.dedupeKey)))
    .limit(1);
  if (existing && existing.status !== "pending" && !(existing.status === "skipped" && !c.skip)) return existing;
  const values = {
    kind: c.kind,
    title: c.title,
    body: c.body,
    url: c.url,
    scheduledFor,
    reason: c.reason,
    habitId: c.habitId ?? null,
    status: (c.skip ? "skipped" : "pending") as Row["status"],
  };
  if (existing) {
    const [row] = await db.update(notifications).set(values).where(eq(notifications.id, existing.id)).returning();
    return row;
  }
  const [row] = await db
    .insert(notifications)
    .values({ ...values, userId: ctx.userId, dedupeKey: c.dedupeKey })
    .onConflictDoNothing()
    .returning();
  return row;
}

/** Recompute today's plan and send whatever is due. Safe to run every few minutes. */
export async function runNotificationTick(ctx: UserContext) {
  const s = ctx.settings.notifications;
  if (!s.enabled) return { planned: 0, sent: 0 };
  const db = await getDb();
  const now = localParts(ctx.now, ctx.timezone);
  const dayStart = zonedTime(ctx.today, "00:00", ctx.timezone);
  const dayEnd = zonedTime(addDays(ctx.today, 1), "00:00", ctx.timezone);
  const quiet = { start: hhmmToMinutes(s.quietStart), end: hhmmToMinutes(s.quietEnd) };
  const isWeekend = [5, 6].includes(weekday(ctx.today));
  const candidates: Candidate[] = [];

  /* Habit reminders */
  if (s.habitReminders) {
    const summaries = (await habitSummaries(ctx)).filter((x) => x.habit.reminderEnabled);
    if (summaries.length) {
      const todayEvents = await db
        .select({ startAt: calendarEvents.startAt, endAt: calendarEvents.endAt })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, ctx.userId), eq(calendarEvents.allDay, false), lt(calendarEvents.startAt, dayEnd), gte(calendarEvents.endAt, dayStart)));
      const busy: Block[] = todayEvents.map((e) => {
        const st = e.startAt < dayStart ? 0 : localParts(e.startAt, ctx.timezone).minutes;
        const en = e.endAt >= dayEnd ? 1440 : localParts(e.endAt, ctx.timezone).minutes;
        return { start: st, end: Math.max(st + 5, en) };
      });

      const since = addDays(ctx.today, -90);
      const history = await db
        .select({ habitId: habitEvents.habitId, date: habitEvents.date, occurredAt: habitEvents.occurredAt })
        .from(habitEvents)
        .where(and(eq(habitEvents.userId, ctx.userId), gte(habitEvents.date, since), eq(habitEvents.status, "completed"), eq(habitEvents.source, "manual")));
      // Busy days in history: ≥ 3 hours of timed calendar events.
      const pastCal = await db
        .select({ day: sql<string>`to_char(${calendarEvents.startAt} at time zone ${ctx.timezone}, 'YYYY-MM-DD')`, hours: sql<number>`sum(extract(epoch from (${calendarEvents.endAt} - ${calendarEvents.startAt})) / 3600)::float8` })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, ctx.userId), eq(calendarEvents.allDay, false), gte(calendarEvents.startAt, zonedTime(since, "00:00", ctx.timezone))))
        .groupBy(sql`1`);
      const busyDays = new Set(pastCal.filter((p) => p.hours >= 3).map((p) => p.day));

      const recentReminders = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, ctx.userId), eq(notifications.kind, "habit_reminder"), eq(notifications.status, "sent"), gte(notifications.scheduledFor, zonedTime(addDays(ctx.today, -14), "00:00", ctx.timezone))))
        .orderBy(desc(notifications.scheduledFor));

      for (const sm of summaries) {
        const h = sm.habit;
        const hist = history
          .filter((e) => e.habitId === h.id && e.date === localParts(e.occurredAt, ctx.timezone).date)
          .map((e) => ({ minutes: localParts(e.occurredAt, ctx.timezone).minutes, weekend: [5, 6].includes(weekday(e.date)), busy: busyDays.has(e.date) }));
        const mine = recentReminders.filter((r) => r.habitId === h.id && r.dedupeKey !== `habit:${h.id}:${ctx.today}`).slice(0, 3);
        const ignored = mine.filter((r) => {
          const d = localParts(r.scheduledFor, ctx.timezone).date;
          return !history.some((e) => e.habitId === h.id && e.date === d);
        }).length;
        const decision = decideHabitReminder({
          habit: { id: h.id, name: h.name, preferredTime: h.preferredTime, frequency: h.frequency, tier: h.tier },
          nowMinutes: now.minutes,
          isWeekend,
          doneToday: sm.today.status === "completed" || sm.today.status === "partial" || sm.today.status === "skipped",
          dueToday: sm.today.scheduled,
          weekly: h.frequency === "weekly_count" ? { done: sm.week.done, expected: sm.week.expected, daysLeftIncludingToday: 7 - weekday(ctx.today) } : undefined,
          history: hist,
          busy,
          quiet,
          ignoredRecently: mine.length >= 3 ? ignored : 0,
        });
        candidates.push({
          kind: "habit_reminder",
          dedupeKey: `habit:${h.id}:${ctx.today}`,
          title: h.name,
          body: h.frequency === "weekly_count" && sm.week ? `נשארו ${sm.week.expected - sm.week.done} פעמים השבוע. זה זמן טוב?` : `זה הזמן שבו זה בדרך כלל קורה${h.timeLabel ? ` (${h.timeLabel})` : ""}.`,
          url: "/today",
          at: decision.at ?? 0,
          reason: { lines: decision.reasons, basis: decision.basis, typical: decision.typical ?? null },
          habitId: h.id,
          priority: h.tier === "main" ? "high" : "normal",
          skip: decision.action === "skip",
        });
      }
    }
  }

  /* Check-in reminder */
  if (s.checkinReminder) {
    const [c] = await db.select({ id: dailyCheckins.id }).from(dailyCheckins).where(and(eq(dailyCheckins.userId, ctx.userId), eq(dailyCheckins.date, ctx.today))).limit(1);
    const at = hhmmToMinutes(s.checkinReminder);
    candidates.push({
      kind: "checkin",
      dedupeKey: `checkin:${ctx.today}`,
      title: "איך היה היום?",
      body: "צ׳ק־אין של חצי דקה: מצב רוח, אנרגיה וריכוז.",
      url: "/today?checkin=1",
      at,
      reason: { lines: [`הגדרת תזכורת צ׳ק־אין ל־${s.checkinReminder}.`, c ? "הצ׳ק־אין כבר מולא." : "הצ׳ק־אין עוד לא מולא היום."] },
      priority: "normal",
      skip: Boolean(c) || inQuietWindow(at, quiet),
    });
  }

  /* Daily brief */
  if (s.dailyBrief) {
    candidates.push({
      kind: "daily_brief",
      dedupeKey: `brief:${ctx.today}`,
      title: "הסיכום היומי מוכן",
      body: "מה בולט היום ודבר אחד ששווה לשים לב אליו.",
      url: "/",
      at: (quiet.end + 20) % 1440,
      reason: { lines: ["ביקשת לקבל את הסיכום היומי בבוקר."] },
      priority: "normal",
    });
  }

  /* Weekly review (Sunday morning) */
  if (s.weeklyReview && weekday(ctx.today) === 0) {
    candidates.push({
      kind: "weekly_review",
      dedupeKey: `weekly:${addDays(startOfWeek(ctx.today), -7)}`,
      title: "הסקירה השבועית מוכנה",
      body: "מה השתנה בשבוע שעבר, מה עבד ומה שווה לבדוק.",
      url: "/insights?tab=weekly",
      at: Math.max((quiet.end + 60) % 1440, 9 * 60),
      reason: { lines: ["סקירה שבועית נשלחת ביום ראשון בבוקר."] },
      priority: "normal",
    });
  }

  /* Notable new insight (at most one per day) */
  if (s.insights && ctx.settings.proactivity !== "quiet") {
    const [ins] = await db
      .select()
      .from(insights)
      .where(and(eq(insights.userId, ctx.userId), eq(insights.status, "new"), inArray(insights.confidence, ["high", "medium"]), gte(insights.createdAt, new Date(ctx.now.getTime() - 86_400_000))))
      .orderBy(desc(insights.score))
      .limit(1);
    if (ins) {
      candidates.push({
        kind: "insight",
        dedupeKey: `insight-day:${ctx.today}`,
        title: "נמצא דפוס חדש",
        body: ins.title,
        url: `/insights/${ins.id}`,
        at: Math.max(now.minutes, 12 * 60),
        reason: { lines: ["התראות על תובנות חדשות מופעלות.", ins.confidenceReason ?? ""] },
        priority: "normal",
      });
    }
  }

  for (const c of candidates) await upsertCandidate(ctx, c);

  /* Deliver what's due */
  const pending = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.userId), eq(notifications.status, "pending"), lt(notifications.scheduledFor, new Date(ctx.now.getTime() + 60_000))));
  const sentToday = await db
    .select({ sentAt: notifications.sentAt })
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.userId), eq(notifications.status, "sent"), gte(notifications.sentAt, dayStart)))
    .orderBy(desc(notifications.sentAt));

  const maxPerDay = ctx.settings.proactivity === "quiet" ? Math.min(1, s.maxPerDay) : ctx.settings.proactivity === "active" ? s.maxPerDay + 1 : s.maxPerDay;
  let sent = 0;
  let sentCount = sentToday.length;
  let lastSent = sentToday[0]?.sentAt ?? null;
  for (const n of pending.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())) {
    const lateMinutes = (ctx.now.getTime() - n.scheduledFor.getTime()) / 60_000;
    const reason = (n.reason ?? {}) as { lines?: string[] };
    if (lateMinutes > 75) {
      await db.update(notifications).set({ status: "skipped", reason: { ...reason, lines: [...(reason.lines ?? []), "חלון הזמן לתזכורת עבר."] } }).where(eq(notifications.id, n.id));
      continue;
    }
    if (inQuietWindow(localParts(ctx.now, ctx.timezone).minutes, quiet)) continue;
    const budget = budgetAllows(
      { sentToday: sentCount, lastSentMinutesAgo: lastSent ? Math.round((ctx.now.getTime() - lastSent.getTime()) / 60_000) : null, maxPerDay, minGapMinutes: s.minGapMinutes },
      n.kind === "habit_reminder" && candidates.find((c) => c.dedupeKey === n.dedupeKey)?.priority === "high" ? "high" : "normal",
    );
    if (!budget.ok) {
      // Wait for the gap to pass unless the window is closing.
      if (lateMinutes > 45 || sentCount >= maxPerDay) {
        await db.update(notifications).set({ status: "skipped", reason: { ...reason, lines: [...(reason.lines ?? []), budget.reason!] } }).where(eq(notifications.id, n.id));
      }
      continue;
    }
    const delivered = await sendPushToUser(ctx.userId, { id: n.id, title: n.title, body: n.body, url: n.url, tag: n.dedupeKey });
    await db.update(notifications).set({ status: "sent", sentAt: ctx.now }).where(eq(notifications.id, n.id));
    await db.insert(notificationEvents).values({ notificationId: n.id, type: delivered > 0 ? "delivered" : "in_app_only", meta: { devices: delivered } });
    sent++;
    sentCount++;
    lastSent = ctx.now;
  }
  log.info("tick", { candidates: candidates.length, sent });
  return { planned: candidates.filter((c) => !c.skip).length, sent };
}

function inQuietWindow(m: number, q: { start: number; end: number }) {
  return q.start > q.end ? m >= q.start || m < q.end : m >= q.start && m < q.end;
}

export async function listNotifications(ctx: UserContext) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.userId), gte(notifications.scheduledFor, zonedTime(addDays(ctx.today, -14), "00:00", ctx.timezone))))
    .orderBy(desc(notifications.scheduledFor))
    .limit(80);
}

export async function recordNotificationEvent(ctx: UserContext, id: string, type: "clicked" | "dismissed" | "read") {
  const db = await getDb();
  const [n] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, ctx.userId))).limit(1);
  if (!n) return;
  await db.insert(notificationEvents).values({ notificationId: id, type });
  if (type !== "dismissed" && !n.readAt) await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
}

export async function markAllRead(ctx: UserContext) {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, ctx.userId), eq(notifications.status, "sent"), sql`${notifications.readAt} is null`));
}
