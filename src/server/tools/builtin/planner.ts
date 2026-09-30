import "server-only";
import { z } from "zod";
import { describeRecurrence, describeWhen, nextOccurrence, normalizeTime, parseLocalDateTime, type RecurrenceRule } from "@/lib/recurrence";
import { cancelReminder, createReminder, findReminders, listReminders } from "../../services/reminders";
import { createTask, findTask, listOpenTasks, setTaskStatus } from "../../services/tasks";
import { defineTool } from "../types";

const recurrence = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly"]),
    interval: z.coerce.number().min(1).max(365).optional(),
    days: z.array(z.coerce.number().min(0).max(6)).optional(),
    time: z.string().optional(),
    until: z.string().optional(),
  })
  .nullish();

export const createReminderTool = defineTool({
  name: "create_reminder",
  description:
    "Schedule a push notification + chat message to the user at a local date/time. `at` is LOCAL time in the user's timezone ('YYYY-MM-DDTHH:MM'). Resolve relative times ('today at 20:00', 'in 2 hours', 'tomorrow morning' = 09:00) from the current local time you were given. For repeating reminders add `recurrence` (days: 0=Sunday…6=Saturday). The text is what the user will see — write it as the reminder itself in Hebrew, e.g. 'להתקשר לאמא'.",
  signature: "{ text: string, at: 'YYYY-MM-DDTHH:MM', recurrence?: { freq: 'daily'|'weekly'|'monthly', interval?: number, days?: number[], time?: 'HH:MM', until?: 'YYYY-MM-DD' } }",
  params: z.object({ text: z.string().min(1).max(500), at: z.string(), recurrence }),
  status: () => "יוצר תזכורת…",
  icon: "bell",
  async run(a, t) {
    const { ctx } = t;
    let due = parseLocalDateTime(a.at, ctx.timezone);
    if (!due) return { ok: false, error: `could not parse 'at' (${a.at}); use YYYY-MM-DDTHH:MM local time` };
    let rule: RecurrenceRule | null = null;
    if (a.recurrence) {
      const time = normalizeTime(a.recurrence.time ?? "") ?? normalizeTime(a.at.slice(11, 16)) ?? "09:00";
      rule = {
        freq: a.recurrence.freq,
        interval: a.recurrence.interval,
        days: a.recurrence.days,
        time,
        start: a.at.slice(0, 10),
        until: a.recurrence.until ? `${a.recurrence.until}T23:59:59Z` : undefined,
      };
      if (due.getTime() <= ctx.now.getTime()) due = nextOccurrence(rule, ctx.now, ctx.timezone);
      if (!due) return { ok: false, error: "recurrence has no future occurrence" };
    } else if (due.getTime() < ctx.now.getTime() - 60_000) {
      return { ok: false, error: `that time (${a.at}) is in the past; current local time is given in your context. Ask the user or pick the next sensible time.` };
    }
    const r = await createReminder(ctx, { text: a.text, dueAt: due, recurrence: rule, conversationId: t.conversationId });
    const when = rule ? `${describeRecurrence(rule)} · הבאה ${describeWhen(due, ctx.now, ctx.timezone)}` : describeWhen(due, ctx.now, ctx.timezone);
    return {
      ok: true,
      data: { id: r.id, text: r.text, due_local: when, repeats: Boolean(rule) },
      chip: { icon: rule ? "repeat" : "bell", text: `${a.text} · ${when}` },
    };
  },
});

export const listRemindersTool = defineTool({
  name: "list_reminders",
  description: "List the user's upcoming scheduled reminders (including habit reminders).",
  signature: "{}",
  params: z.object({}).passthrough(),
  status: () => "בודק תזכורות…",
  icon: "bell",
  async run(_a, t) {
    const rows = await listReminders(t.ctx, 25);
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        text: r.text,
        when: describeWhen(r.dueAt, t.ctx.now, t.ctx.timezone),
        repeats: r.recurrence ? describeRecurrence(r.recurrence) : null,
        kind: r.kind,
      })),
    };
  },
});

export const cancelReminderTool = defineTool({
  name: "cancel_reminder",
  description: "Cancel a scheduled reminder by id, or by describing it (matches its text).",
  signature: "{ id_or_text: string }",
  params: z.object({ id_or_text: z.string().min(1) }),
  status: () => "מבטל תזכורת…",
  icon: "bell",
  async run(a, t) {
    const found = await findReminders(t.ctx, a.id_or_text);
    if (!found.length) return { ok: false, error: "no matching reminder" };
    if (found.length > 1 && found[0].id !== a.id_or_text) {
      return { ok: false, error: "ambiguous — ask the user which one", data: found.slice(0, 5).map((r) => ({ id: r.id, text: r.text })) };
    }
    await cancelReminder(t.ctx, found[0].id);
    return { ok: true, data: { cancelled: found[0].text }, chip: { icon: "bell", text: `בוטל: ${found[0].text}` } };
  },
});

export const createTaskTool = defineTool({
  name: "create_task",
  description: "Add a to-do item to the user's task list (no notification). Use create_reminder instead when they want to be notified at a time.",
  signature: "{ title: string, due?: 'YYYY-MM-DD' | 'YYYY-MM-DDTHH:MM', notes?: string, priority?: 1|2|3 }",
  params: z.object({ title: z.string().min(1).max(300), due: z.string().optional(), notes: z.string().max(2000).optional(), priority: z.coerce.number().optional() }),
  status: () => "מוסיף למשימות…",
  icon: "task",
  async run(a, t) {
    const due = a.due ? parseLocalDateTime(a.due.length === 10 ? `${a.due}T18:00` : a.due, t.ctx.timezone) : null;
    const task = await createTask(t.ctx, { title: a.title, notes: a.notes, dueAt: due, priority: a.priority });
    return { ok: true, data: { id: task.id }, chip: { icon: "task", text: due ? `${a.title} · ${describeWhen(due, t.ctx.now, t.ctx.timezone)}` : a.title } };
  },
});

export const listTasksTool = defineTool({
  name: "list_tasks",
  description: "List the user's open to-do items.",
  signature: "{}",
  params: z.object({}).passthrough(),
  status: () => "בודק משימות…",
  icon: "task",
  async run(_a, t) {
    const rows = await listOpenTasks(t.ctx);
    return { ok: true, data: rows.map((r) => ({ id: r.id, title: r.title, due: r.dueAt ? describeWhen(r.dueAt, t.ctx.now, t.ctx.timezone) : null, priority: r.priority })) };
  },
});

export const completeTaskTool = defineTool({
  name: "complete_task",
  description: "Mark a to-do item done (or cancelled) by id or by describing it.",
  signature: "{ id_or_text: string, status?: 'done'|'cancelled' }",
  params: z.object({ id_or_text: z.string().min(1), status: z.enum(["done", "cancelled"]).default("done") }),
  status: () => "מעדכן משימה…",
  icon: "check",
  async run(a, t) {
    const task = await findTask(t.ctx, a.id_or_text);
    if (!task) return { ok: false, error: "no matching open task" };
    await setTaskStatus(t.ctx, task.id, a.status);
    return { ok: true, data: { title: task.title, status: a.status }, chip: { icon: "check", text: task.title } };
  },
});

