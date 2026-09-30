import "server-only";
import { z } from "zod";
import { describeWhen } from "@/lib/recurrence";
import { createGoal, findGoal, goalProgressText, listGoals, updateGoal } from "../../services/goals";
import { createHabit, findHabit, habitScheduleText, habitStatuses, logHabit, setHabitStatus } from "../../services/habits";
import { defineTool } from "../types";

const num = z.coerce.number().optional();

export const createGoalTool = defineTool({
  name: "create_goal",
  description:
    "Create a long-term personal goal ('lose 3kg in two months', 'finish the course by December'). Capture a measurable metric when there is one (unit/start/target), a due date, and how often to check in on progress (days). JARVIS will follow up automatically.",
  signature: "{ title: string, description?: string, unit?: string, start?: number, target?: number, due_date?: 'YYYY-MM-DD', check_in_every_days?: number }",
  params: z.object({
    title: z.string().min(2).max(200),
    description: z.string().max(1000).optional(),
    unit: z.string().max(30).optional(),
    start: num,
    target: num,
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    check_in_every_days: num,
  }),
  status: () => "שומר את היעד…",
  icon: "target",
  async run(a, t) {
    const g = await createGoal(t.ctx, {
      title: a.title,
      description: a.description,
      metric: { unit: a.unit, start: a.start, target: a.target },
      dueDate: a.due_date,
      checkInEveryDays: a.check_in_every_days,
    });
    const next = g.nextCheckInAt ? describeWhen(g.nextCheckInAt, t.ctx.now, t.ctx.timezone) : null;
    return { ok: true, data: { id: g.id, next_check_in: next }, chip: { icon: "target", text: `יעד חדש: ${g.title}` } };
  },
});

export const updateGoalTool = defineTool({
  name: "update_goal",
  description: "Record progress on a goal (a new measured value and/or a note), or mark it done/abandoned. Identify the goal by id or name.",
  signature: "{ goal: string, value?: number, note?: string, status?: 'active'|'done'|'abandoned' }",
  params: z.object({ goal: z.string().min(1), value: num, note: z.string().max(500).optional(), status: z.enum(["active", "done", "abandoned"]).optional() }),
  status: () => "מעדכן התקדמות…",
  icon: "target",
  async run(a, t) {
    const g = await findGoal(t.ctx, a.goal);
    if (!g) return { ok: false, error: "no matching active goal" };
    const u = await updateGoal(t.ctx, g, { value: a.value, note: a.note, status: a.status });
    return {
      ok: true,
      data: { title: u.title, progress: goalProgressText(u), status: u.status, history: (u.progress ?? []).slice(-6) },
      chip: { icon: "target", text: a.status === "done" ? `הושג: ${u.title}` : `${u.title}${goalProgressText(u) ? ` · ${goalProgressText(u)}` : ""}` },
    };
  },
});

export const listGoalsTool = defineTool({
  name: "list_goals",
  description: "List active goals with their progress history.",
  signature: "{}",
  params: z.object({}).passthrough(),
  status: () => "בודק את היעדים שלך…",
  icon: "target",
  async run(_a, t) {
    const rows = await listGoals(t.ctx);
    return {
      ok: true,
      data: rows.map((g) => ({ id: g.id, title: g.title, description: g.description, metric: g.metric, due: g.dueDate, progress: (g.progress ?? []).slice(-8) })),
    };
  },
});

export const createHabitTool = defineTool({
  name: "create_habit",
  description:
    "Start tracking a recurring habit ('read 20 minutes every evening'). days: 0=Sunday…6=Saturday (omit for every day). time: local 'HH:MM' for a daily nudge — pick a sensible one from the user's words ('evening' ≈ 21:00, 'morning' ≈ 08:00) and mention it so they can change it.",
  signature: "{ title: string, description?: string, days?: number[], time?: 'HH:MM' }",
  params: z.object({
    title: z.string().min(2).max(200),
    description: z.string().max(1000).optional(),
    days: z.array(z.coerce.number().min(0).max(6)).optional(),
    time: z.string().optional(),
  }),
  status: () => "בונה את ההרגל…",
  icon: "repeat",
  async run(a, t) {
    const { habit, nextReminder } = await createHabit(t.ctx, { ...a, conversationId: t.conversationId });
    return {
      ok: true,
      data: { id: habit.id, schedule: habitScheduleText(habit.schedule), first_reminder: nextReminder ? describeWhen(nextReminder, t.ctx.now, t.ctx.timezone) : null },
      chip: { icon: "repeat", text: `${habit.title} · ${habitScheduleText(habit.schedule)}` },
    };
  },
});

export const logHabitTool = defineTool({
  name: "log_habit",
  description: "Mark a habit done (or skipped) for a day — default today. Use when the user says they did it (or didn't).",
  signature: "{ habit: string, date?: 'YYYY-MM-DD', status?: 'done'|'skipped', note?: string }",
  params: z.object({
    habit: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(["done", "skipped"]).default("done"),
    note: z.string().max(500).optional(),
  }),
  status: () => "מסמן את ההרגל…",
  icon: "check",
  async run(a, t) {
    const h = await findHabit(t.ctx, a.habit);
    if (!h) return { ok: false, error: "no matching habit" };
    const day = a.date && a.date <= t.ctx.today ? a.date : t.ctx.today;
    await logHabit(t.ctx, h, day, a.status, a.note);
    const s = (await habitStatuses(t.ctx)).find((x) => x.habit.id === h.id);
    return {
      ok: true,
      data: { habit: h.title, day, status: a.status, streak: s?.streak ?? 0 },
      chip: { icon: "check", text: a.status === "done" ? `${h.title} ✓${s && s.streak > 1 ? ` · ${s.streak} ברצף` : ""}` : `${h.title} · דילגת היום` },
    };
  },
});

export const listHabitsTool = defineTool({
  name: "list_habits",
  description: "List habits with today's status, current streak and the last 7 days.",
  signature: "{}",
  params: z.object({}).passthrough(),
  status: () => "בודק את ההרגלים…",
  icon: "repeat",
  async run(_a, t) {
    const rows = await habitStatuses(t.ctx);
    return {
      ok: true,
      data: rows.map((s) => ({ id: s.habit.id, title: s.habit.title, schedule: habitScheduleText(s.habit.schedule), today: s.doneToday ? "done" : s.scheduledToday ? "open" : "off", streak: s.streak, last7: s.week.join(",") })),
    };
  },
});

export const updateHabitTool = defineTool({
  name: "update_habit",
  description: "Pause, resume or stop (archive) a habit.",
  signature: "{ habit: string, status: 'active'|'paused'|'archived' }",
  params: z.object({ habit: z.string().min(1), status: z.enum(["active", "paused", "archived"]) }),
  status: () => "מעדכן את ההרגל…",
  icon: "repeat",
  async run(a, t) {
    const h = await findHabit(t.ctx, a.habit);
    if (!h) return { ok: false, error: "no matching habit" };
    await setHabitStatus(t.ctx, h, a.status);
    return { ok: true, data: { habit: h.title, status: a.status } };
  },
});

