import "server-only";
/**
 * Demo data: ~100 days of realistic, internally consistent history so every screen and the
 * analytics can be explored immediately. Everything is tagged source="demo" and can be
 * removed in one action without touching real data.
 */
import { and, eq, inArray } from "drizzle-orm";
import { addDays, eachDay, weekday, zonedTime, type ISODate } from "@/lib/dates";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import {
  calendarEvents,
  dailyCheckins,
  experiments,
  goalHabits,
  goalProgress,
  goals,
  habitEvents,
  habits,
  insights,
  journalEntries,
  metrics,
  reports,
  transactions,
} from "../db/schema";
import { listHabits } from "./habits";
import { refreshInsights } from "./insights";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const JOURNAL = [
  "יום עמוס בעבודה, הרבה פגישות ברצף. בערב כבר לא היה לי כוח לאימון.",
  "אימון טוב בחדר כושר, הרגשתי חזק. אחרי זה ישנתי מצוין.",
  "הלכתי לישון מאוחר בגלל סדרה. בבוקר הייתי מפוזר.",
  "יום רגוע יחסית. הספקתי לסיים משימה גדולה שדחיתי כבר שבוע.",
  "שיעור סלסה היה כיף, אבל חזרתי הביתה מאוחר.",
  "ריצה קלה לפני היציאה עם החברים. ערב מעולה.",
  "הרגשתי קצת לחוץ לגבי הדדליין בעבודה. ניסיתי לעשות הפסקות קצרות.",
  "לא אכלתי מספיק חלבון היום, היה יום של נשנושים.",
  "שבוע כבד, אבל שמרתי על השגרה. גאה בעצמי.",
  "בוקר של עבודה ממוקדת בלי טלפון. הכי פרודוקטיבי שהיה לי השבוע.",
];

const DEMO_HABITS = [
  { name: "חדר כושר", tier: "main" as const, frequency: "specific_days" as const, scheduleDays: [0, 1, 3, 4], preferredTime: "18:00", timeLabel: "18:00–19:30", metricKey: "workout_minutes" },
  { name: "ריצה", tier: "main" as const, frequency: "specific_days" as const, scheduleDays: [5, 6], preferredTime: "18:30", timeLabel: "ערב", metricKey: "workout_minutes" },
  { name: "קריאה 20 דקות", tier: "side" as const, frequency: "daily" as const, scheduleDays: [0, 1, 2, 3, 4, 5, 6], preferredTime: "22:00", timeLabel: null, metricKey: null },
  { name: "7,000 צעדים", tier: "side" as const, frequency: "daily" as const, scheduleDays: [0, 1, 2, 3, 4, 5, 6], preferredTime: null, timeLabel: null, metricKey: "steps", kind: "quantity" as const, targetValue: 7000, unit: "צעדים" },
];

export async function loadDemoData(ctx: UserContext, days = 100) {
  const db = await getDb();
  const rand = rng(1710);
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  let habitRows = await listHabits(ctx);
  if (!habitRows.length) {
    await db.insert(habits).values(
      DEMO_HABITS.map((h, i) => ({
        userId: ctx.userId,
        name: h.name,
        tier: h.tier,
        frequency: h.frequency,
        scheduleDays: h.scheduleDays,
        preferredTime: h.preferredTime,
        timeLabel: h.timeLabel,
        metricKey: h.metricKey,
        kind: (h.kind ?? "boolean") as "boolean" | "quantity",
        targetValue: h.targetValue ?? null,
        unit: h.unit ?? null,
        reminderEnabled: h.tier === "main",
        sortOrder: i,
        startDate: addDays(ctx.today, -days),
        source: "demo",
      })),
    );
    habitRows = await listHabits(ctx);
  }

  const from = addDays(ctx.today, -days);
  const to = addDays(ctx.today, -1);
  const dates = eachDay(from, to);

  const metricRows: (typeof metrics.$inferInsert)[] = [];
  const eventRows: (typeof habitEvents.$inferInsert)[] = [];
  const checkinRows: (typeof dailyCheckins.$inferInsert)[] = [];
  const txRows: (typeof transactions.$inferInsert)[] = [];
  const calRows: (typeof calendarEvents.$inferInsert)[] = [];
  const journalRows: (typeof journalEntries.$inferInsert)[] = [];

  let exercisedYesterday = false;
  let weight = 79.2;
  // Two "crunch" weeks with heavy meeting load.
  const heavyWeeks = new Set([Math.floor(days * 0.3 / 7), Math.floor(days * 0.75 / 7)]);

  dates.forEach((date, idx) => {
    const wd = weekday(date);
    const weekend = wd === 5 || wd === 6;
    const heavy = heavyWeeks.has(Math.floor(idx / 7));
    // Improvement over time: better sleep in the last third (e.g. after an experiment).
    const late = idx > days * 0.62;

    const meetings = weekend ? 0 : Math.max(0, Math.round((heavy ? 6 : 2.6) + gauss() * 1.3));
    const workHours = weekend ? (rand() < 0.15 ? 2 : 0) : clamp(7.8 + meetings * 0.25 + gauss() * 0.8, 5, 12);
    const bedtime = clamp((late ? 700 : 735) + (weekend ? 40 : 0) + meetings * 4 + gauss() * 30, 630, 840); // minutes after noon
    const sleep = clamp(7.1 + (late ? 0.35 : 0) + (weekend ? 0.6 : 0) - (bedtime - 720) / 90 - (heavy ? 0.4 : 0) + gauss() * 0.55, 4.5, 9.8);

    // Workouts: less likely on meeting-heavy days.
    const planned = [0, 1, 3, 4].includes(wd) ? "gym" : [5, 6].includes(wd) ? "run" : null;
    const pWorkout = planned === "gym" ? (meetings >= 5 ? 0.35 : 0.85) : planned === "run" ? 0.62 : 0.05;
    const exercised = rand() < pWorkout;
    const workoutMinutes = exercised ? Math.round(planned === "run" ? 35 + gauss() * 8 : 70 + gauss() * 12) : 0;
    const steps = Math.round(clamp(5200 + (exercised ? 3200 : 0) + (weekend ? 1500 : 0) - meetings * 250 + gauss() * 1600, 1500, 19000));

    const mood = clamp(Math.round(6 + (sleep - 7) * 0.7 + (exercisedYesterday ? 0.8 : 0) + (exercised ? 0.5 : 0) - (heavy ? 0.7 : 0) + gauss() * 0.9), 1, 10);
    const energy = clamp(Math.round(5.8 + (sleep - 7) * 0.9 + (exercisedYesterday ? 0.6 : 0) - meetings * 0.12 + gauss() * 0.9), 1, 10);
    const focus = clamp(Math.round(6.2 + (sleep - 7) * 0.6 - Math.max(0, meetings - 3) * 0.45 + gauss() * 1), 1, 10);

    const sleepStart = zonedTime(addDays(date, -1), "12:00", ctx.timezone);
    metricRows.push({ userId: ctx.userId, metricKey: "sleep_hours", value: Math.round(sleep * 100) / 100, date, source: "demo", startAt: new Date(sleepStart.getTime() + bedtime * 60_000), endAt: new Date(sleepStart.getTime() + (bedtime + sleep * 60) * 60_000) });
    metricRows.push({ userId: ctx.userId, metricKey: "bedtime", value: Math.round(bedtime), date, source: "demo" });
    metricRows.push({ userId: ctx.userId, metricKey: "steps", value: steps, date, source: "demo" });
    if (workHours > 0) metricRows.push({ userId: ctx.userId, metricKey: "work_hours", value: Math.round(workHours * 4) / 4, date, source: "demo" });
    if (workoutMinutes > 0) {
      const start = zonedTime(date, planned === "run" ? "18:30" : meetings >= 4 ? "20:15" : "18:05", ctx.timezone);
      metricRows.push({ userId: ctx.userId, metricKey: "workout_minutes", value: workoutMinutes, date, source: "demo", startAt: start, endAt: new Date(start.getTime() + workoutMinutes * 60_000), note: planned === "run" ? "ריצה" : "אימון כוח" });
    }
    if (idx % 4 === 0) {
      weight = weight - 0.045 + gauss() * 0.25;
      metricRows.push({ userId: ctx.userId, metricKey: "weight", value: Math.round(weight * 10) / 10, date, source: "demo" });
    }
    metricRows.push({ userId: ctx.userId, metricKey: "protein_g", value: Math.round(clamp(115 + (exercised ? 15 : -5) + gauss() * 22, 50, 200)), date, source: "demo" });

    // Habit outcomes.
    for (const h of habitRows) {
      const sched = h.frequency === "specific_days" ? (h.scheduleDays ?? []).includes(wd) : true;
      if (!sched || h.frequency === "weekly_count") continue;
      const isWorkoutHabit = h.metricKey === "workout_minutes";
      let status: "completed" | "missed" | "partial" | "skipped";
      if (isWorkoutHabit) status = exercised ? "completed" : "missed";
      else if (h.metricKey === "steps") status = steps >= (h.targetValue ?? 7000) ? "completed" : steps >= (h.targetValue ?? 7000) * 0.6 ? "partial" : "missed";
      else if (h.metricKey === "sleep_hours" || /שינה/.test(h.name)) status = sleep >= 7 ? "completed" : "missed";
      else if (/חלבון/.test(h.name)) status = rand() < 0.72 ? "completed" : "missed";
      else if (/סלסה|ריקוד/.test(h.name)) status = rand() < 0.85 ? "completed" : "missed";
      else if (/חברים/.test(h.name)) status = rand() < 0.8 ? "completed" : "missed";
      else status = rand() < 0.35 + (sleep - 6) * 0.12 - (heavy ? 0.15 : 0) ? "completed" : rand() < 0.1 ? "skipped" : "missed";
      const minutes = h.preferredTime ? Number(h.preferredTime.slice(0, 2)) * 60 + Number(h.preferredTime.slice(3, 5)) : 20 * 60;
      const shift = isWorkoutHabit && meetings >= 4 ? 135 : Math.round(gauss() * 25);
      const hhmm = `${String(Math.floor(clamp(minutes + shift, 360, 1430) / 60)).padStart(2, "0")}:${String(clamp(minutes + shift, 360, 1430) % 60).padStart(2, "0")}`;
      eventRows.push({ userId: ctx.userId, habitId: h.id, date, status, source: "demo", occurredAt: zonedTime(date, hhmm, ctx.timezone) });
    }

    if (rand() < 0.86) {
      const tags = [heavy ? "עומס" : null, exercised ? "אימון" : null, weekend ? "סופ״ש" : null].filter(Boolean) as string[];
      checkinRows.push({ userId: ctx.userId, date, mood, energy, focus, tags, source: "demo", highlight: idx % 23 === 5 ? "סיימתי פרויקט גדול בעבודה" : null });
    }

    // Calendar.
    let cursor = 9 * 60 + Math.round(rand() * 60);
    for (let m = 0; m < meetings; m++) {
      const len = rand() < 0.7 ? 30 : 60;
      const start = zonedTime(date, `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`, ctx.timezone);
      calRows.push({ userId: ctx.userId, title: ["סנכרון צוות", "פגישת 1:1", "סקירת קוד", "תכנון ספרינט", "שיחה עם לקוח", "ישיבת מוצר"][Math.floor(rand() * 6)], startAt: start, endAt: new Date(start.getTime() + len * 60_000), kind: "meeting", source: "demo", externalId: `demo|${date}|${m}` });
      cursor += len + Math.round(rand() * 90);
      if (heavy && m === meetings - 1 && cursor < 17 * 60) {
        const late = zonedTime(date, "18:00", ctx.timezone);
        calRows.push({ userId: ctx.userId, title: "ישיבת דדליין", startAt: late, endAt: new Date(late.getTime() + 120 * 60_000), kind: "meeting", source: "demo", externalId: `demo|${date}|late` });
      }
    }

    // Spending.
    const spend = (category: string, amount: number, merchant: string) => txRows.push({ userId: ctx.userId, date, amount: Math.round(amount), category, merchant, source: "demo" });
    if (wd === 0 || wd === 4) spend("groceries", 180 + rand() * 260, rand() < 0.5 ? "שופרסל" : "רמי לוי");
    if (rand() < (weekend ? 0.7 : 0.3)) spend("restaurants", 45 + rand() * 180, ["ארומה", "וולט", "פיצה", "סושי בר"][Math.floor(rand() * 4)]);
    if (!weekend && rand() < 0.5) spend("transport", 12 + rand() * 25, "רב־קו");
    if (rand() < 0.06) spend("shopping", 90 + rand() * 400, "KSP");
    if (date.endsWith("-01")) spend("fitness", 229, "הולמס פלייס");

    if (rand() < 0.28 || idx === dates.length - 2) {
      const body = JOURNAL[Math.floor(rand() * JOURNAL.length)];
      journalRows.push({ userId: ctx.userId, date, occurredAt: zonedTime(date, "22:30", ctx.timezone), body, tags: exercised ? ["אימון"] : [], source: "demo" });
    }

    exercisedYesterday = exercised;
  });

  const chunk = async <T>(rows: T[], fn: (c: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 400) await fn(rows.slice(i, i + 400));
  };
  await chunk(metricRows, (c) => db.insert(metrics).values(c));
  await chunk(eventRows, (c) => db.insert(habitEvents).values(c).onConflictDoNothing());
  await chunk(checkinRows, (c) => db.insert(dailyCheckins).values(c).onConflictDoNothing());
  await chunk(txRows, (c) => db.insert(transactions).values(c));
  await chunk(calRows, (c) => db.insert(calendarEvents).values(c).onConflictDoNothing());
  await chunk(journalRows, (c) => db.insert(journalEntries).values(c));

  // A goal and a finished experiment, so those screens have something to show.
  const [goal] = await db
    .insert(goals)
    .values({ userId: ctx.userId, title: "לרדת ל־76.5 ק״ג", description: "ירידה הדרגתית תוך שמירה על כוח", progressMode: "manual", targetValue: 76.5, startValue: 79.2, unit: "ק״ג", deadline: addDays(ctx.today, 45), metricKeys: ["weight"], source: "demo" })
    .returning();
  await db.insert(goalProgress).values([
    { goalId: goal.id, value: 79.2, note: "נקודת התחלה", recordedAt: zonedTime(from, "08:00", ctx.timezone) },
    { goalId: goal.id, value: Math.round(weight * 10) / 10, recordedAt: zonedTime(to, "08:00", ctx.timezone) },
  ]);
  const gym = habitRows.find((h) => h.metricKey === "workout_minutes");
  if (gym) await db.insert(goalHabits).values({ goalId: goal.id, habitId: gym.id }).onConflictDoNothing();

  const expStart = addDays(ctx.today, -Math.round(days * 0.38));
  await db.insert(experiments).values({
    userId: ctx.userId,
    title: "ללכת לישון לפני 23:30",
    hypothesis: "שינה מוקדמת יותר תשפר את האנרגיה והריכוז",
    intervention: "כיבוי מסכים ב־23:00",
    startDate: expStart,
    endDate: addDays(expStart, 20),
    baselineDays: 21,
    targetKeys: ["sleep_hours", "energy", "focus"],
    status: "completed",
    source: "demo",
  });

  await refreshInsights(ctx);
  return { days: dates.length, metrics: metricRows.length, habitEvents: eventRows.length };
}

export async function removeDemoData(ctx: UserContext) {
  const db = await getDb();
  const u = ctx.userId;
  await db.transaction(async (tx) => {
    await tx.delete(habitEvents).where(and(eq(habitEvents.userId, u), eq(habitEvents.source, "demo")));
    await tx.delete(metrics).where(and(eq(metrics.userId, u), eq(metrics.source, "demo")));
    await tx.delete(dailyCheckins).where(and(eq(dailyCheckins.userId, u), eq(dailyCheckins.source, "demo")));
    await tx.delete(transactions).where(and(eq(transactions.userId, u), eq(transactions.source, "demo")));
    await tx.delete(calendarEvents).where(and(eq(calendarEvents.userId, u), eq(calendarEvents.source, "demo")));
    await tx.delete(journalEntries).where(and(eq(journalEntries.userId, u), eq(journalEntries.source, "demo")));
    await tx.delete(goals).where(and(eq(goals.userId, u), eq(goals.source, "demo")));
    await tx.delete(experiments).where(and(eq(experiments.userId, u), eq(experiments.source, "demo")));
    await tx.delete(habits).where(and(eq(habits.userId, u), eq(habits.source, "demo")));
    // Derived artefacts are recomputed from what remains.
    await tx.delete(insights).where(and(eq(insights.userId, u), eq(insights.generatedBy, "analytics")));
    await tx.delete(reports).where(eq(reports.userId, u));
  });
  await refreshInsights(ctx);
}

export async function hasDemoData(ctx: UserContext) {
  const db = await getDb();
  const [row] = await db.select({ id: metrics.id }).from(metrics).where(and(eq(metrics.userId, ctx.userId), inArray(metrics.source, ["demo"]))).limit(1);
  return Boolean(row);
}
