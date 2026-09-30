import "server-only";
import { and, eq } from "drizzle-orm";
import { describeWhen } from "@/lib/recurrence";
import { loadContext, type UserContext } from "../context";
import { getDb } from "../db/client";
import { habitLogs, habits, type MessageKind } from "../db/schema";
import { errorInfo, logger } from "../logger";
import { sendPushToUser } from "../notifications/push";
import { appendMessage, createConversation, getConversation, latestConversation } from "../services/conversations";
import { claimDueGoalCheckIns, goalProgressText, type Goal } from "../services/goals";
import { claimDueReminders, settleReminder, type Reminder } from "../services/reminders";

const log = logger("scheduler");

/**
 * The scheduler entry point — called every minute (Supabase Cron → /api/cron/tick; GitHub Actions
 * as a backup). Idempotent: reminders and check-ins are claimed atomically, so overlapping ticks
 * never double-deliver.
 */
export async function runTick(now = new Date()) {
  const contexts = new Map<string, UserContext>();
  const ctxFor = async (userId: string) => {
    let c = contexts.get(userId);
    if (!c) {
      c = await loadContext(userId, now);
      contexts.set(userId, c);
    }
    return c;
  };

  let reminders = 0;
  let skipped = 0;
  for (const r of await claimDueReminders(now)) {
    try {
      const ctx = await ctxFor(r.userId);
      (await deliverReminder(ctx, r)) ? reminders++ : skipped++;
      await settleReminder(r, now, ctx.timezone);
    } catch (e) {
      log.error("reminder delivery failed", { reminder: r.id, ...errorInfo(e) });
    }
  }

  let checkIns = 0;
  for (const g of await claimDueGoalCheckIns(now)) {
    try {
      await deliverGoalCheckIn(await ctxFor(g.userId), g);
      checkIns++;
    } catch (e) {
      log.error("goal check-in failed", { goal: g.id, ...errorInfo(e) });
    }
  }
  return { reminders, skipped, checkIns };
}

async function targetConversation(ctx: UserContext, preferred: string | null) {
  if (preferred) {
    const c = await getConversation(ctx, preferred);
    if (c && !c.archivedAt) return c.id;
  }
  return (await latestConversation(ctx))?.id ?? (await createConversation(ctx)).id;
}

async function deliver(ctx: UserContext, o: { conversationId: string | null; kind: MessageKind; text: string; push: { title: string; body: string }; tag: string; meta: Record<string, unknown> }) {
  const conversationId = await targetConversation(ctx, o.conversationId);
  const msg = await appendMessage(ctx, { conversationId, role: "assistant", content: o.text, kind: o.kind, inputMode: "system", meta: o.meta });
  const sent = await sendPushToUser(ctx.userId, { id: msg.id, title: o.push.title, body: o.push.body, url: `/?c=${conversationId}`, tag: o.tag });
  return { messageId: msg.id, pushed: sent };
}

/** Returns false when the reminder was intentionally not delivered (e.g. habit already done today). */
async function deliverReminder(ctx: UserContext, r: Reminder): Promise<boolean> {
  const late = ctx.now.getTime() - r.dueAt.getTime() > 30 * 60_000;
  if (r.kind === "habit" && r.refId) {
    const db = await getDb();
    const [habit] = await db.select().from(habits).where(eq(habits.id, r.refId)).limit(1);
    if (!habit || habit.status !== "active") return false;
    const [done] = await db
      .select({ id: habitLogs.id })
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, habit.id), eq(habitLogs.day, ctx.today)))
      .limit(1);
    if (done) return false; // already done today — no nagging
    await deliver(ctx, {
      conversationId: r.conversationId,
      kind: "habit",
      text: `${habit.title.startsWith("ל") ? `🔁 הגיע הזמן ${habit.title}` : `🔁 ${habit.title} — הגיע הזמן`}.\nספר לי כשסיימת ואסמן את זה.`,
      push: { title: "הרגל יומי", body: habit.title },
      tag: `habit-${habit.id}`,
      meta: { reminderId: r.id, habitId: habit.id },
    });
    return true;
  }
  await deliver(ctx, {
    conversationId: r.conversationId,
    kind: "reminder",
    text: `⏰ ${r.text}${late ? `\n(הייתה אמורה להגיע ${describeWhen(r.dueAt, ctx.now, ctx.timezone)})` : ""}`,
    push: { title: "תזכורת", body: r.text },
    tag: `reminder-${r.id}`,
    meta: { reminderId: r.id },
  });
  return true;
}

async function deliverGoalCheckIn(ctx: UserContext, g: Goal) {
  const progress = goalProgressText(g);
  await deliver(ctx, {
    conversationId: null,
    kind: "goal_checkin",
    text: `🎯 בדיקת התקדמות: **${g.title}**${progress ? `\n${progress}.` : ""}\nאיך זה הולך? ספר לי ואעדכן.`,
    push: { title: "איך מתקדם היעד?", body: g.title },
    tag: `goal-${g.id}`,
    meta: { goalId: g.id },
  });
}
