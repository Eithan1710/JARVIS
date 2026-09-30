import "server-only";
import { addDays, localParts, weekday } from "@/lib/dates";
import { describeRecurrence, describeWhen } from "@/lib/recurrence";
import type { UserContext } from "../context";
import { connectionSummary } from "../connections/registry";
import { listMessages } from "../services/conversations";
import { goalProgressText, listGoals } from "../services/goals";
import { habitScheduleText, habitStatuses } from "../services/habits";
import { searchHistory } from "../services/history";
import { listMemories, touchMemories } from "../services/memory";
import { listReminders } from "../services/reminders";
import { listOpenTasks } from "../services/tasks";
import { clip, searchTerms } from "../services/text";
import type { AIMessage } from "../ai/types";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Now" block with a 7-day calendar so the model never has to do date arithmetic. */
export function timeBlock(ctx: UserContext): string {
  const p = localParts(ctx.now, ctx.timezone);
  const hhmm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  const days = Array.from({ length: 8 }, (_, i) => {
    const d = addDays(ctx.today, i);
    return `${i === 0 ? "today" : i === 1 ? "tomorrow" : "        "} ${DAY_NAMES[weekday(d)]} ${d}`;
  });
  return `Current local time: ${DAY_NAMES[weekday(ctx.today)]} ${ctx.today} ${hhmm} (${ctx.timezone}).\nUpcoming days:\n${days.join("\n")}`;
}

export interface LifeContext {
  memoryBlock: string;
  lifeBlock: string;
  pastBlock: string;
  connectionsBlock: string;
  history: AIMessage[];
}

/**
 * Assemble what the Leader sees for one turn. The complete history stays in the database;
 * only the current thread, the curated memory, the live state of goals/habits/reminders/tasks
 * and a handful of retrieved past snippets are loaded.
 */
export async function buildLifeContext(ctx: UserContext, conversationId: string, userText: string, currentMessageId: string): Promise<LifeContext> {
  const [mems, goals, habits, reminders, tasks, thread, past, conns] = await Promise.all([
    listMemories(ctx, 80),
    listGoals(ctx),
    habitStatuses(ctx),
    listReminders(ctx, 8),
    listOpenTasks(ctx, 10),
    listMessages(ctx, conversationId, { limit: 30 }),
    searchTerms(userText).length ? searchHistory(ctx, userText, { limit: 4, excludeConversationId: conversationId }).catch(() => []) : Promise.resolve([]),
    connectionSummary(ctx),
  ]);
  void touchMemories(ctx, mems.map((m) => m.id)).catch(() => {});

  const memoryBlock = mems.length
    ? mems.map((m) => `- [${m.id}] (${m.kind}) ${m.content}`).join("\n")
    : "(nothing saved yet — you are just getting to know the user)";

  const life: string[] = [];
  if (goals.length) {
    life.push(
      "Goals:\n" +
        goals
          .map((g) => {
            const last = (g.progress ?? []).at(-1);
            return `- [${g.id}] ${g.title}${g.dueDate ? ` (by ${g.dueDate})` : ""}${goalProgressText(g) ? ` — ${goalProgressText(g)}` : ""}${last ? ` — last update ${last.at.slice(0, 10)}${last.note ? `: ${clip(last.note, 80)}` : ""}` : ""}`;
          })
          .join("\n"),
    );
  }
  if (habits.length) {
    life.push(
      "Habits:\n" +
        habits
          .map((s) => `- [${s.habit.id}] ${s.habit.title} — ${habitScheduleText(s.habit.schedule)}; today: ${s.doneToday ? "done" : s.scheduledToday ? "not yet" : "not scheduled"}; streak ${s.streak}; last 7 days ${s.week.join(",")}`)
          .join("\n"),
    );
  }
  if (reminders.length) {
    life.push(
      "Upcoming reminders:\n" +
        reminders.map((r) => `- [${r.id}] ${r.text} — ${describeWhen(r.dueAt, ctx.now, ctx.timezone)}${r.recurrence ? ` (${describeRecurrence(r.recurrence)})` : ""}`).join("\n"),
    );
  }
  if (tasks.length) {
    life.push("Open tasks:\n" + tasks.map((t) => `- [${t.id}] ${t.title}${t.dueAt ? ` — due ${describeWhen(t.dueAt, ctx.now, ctx.timezone)}` : ""}`).join("\n"));
  }

  const pastBlock = past.length
    ? past.map((h) => `- ${h.at.slice(0, 10)} ${h.role === "user" ? "user" : "you"}: ${clip(h.snippet, 220)}`).join("\n")
    : "";

  // Current thread, newest last, within a character budget. The current user message is sent separately.
  const budget = 14_000;
  let used = 0;
  const history: AIMessage[] = [];
  for (const m of thread.filter((m) => m.id !== currentMessageId).reverse()) {
    const content = m.kind !== "chat" ? `[proactive ${m.kind} you sent] ${m.content}` : m.content;
    if (used + content.length > budget) break;
    used += content.length;
    history.unshift({ role: m.role, content: clip(content, 4000) });
  }

  return {
    memoryBlock,
    lifeBlock: life.join("\n\n") || "(no goals, habits, reminders or tasks yet)",
    pastBlock,
    connectionsBlock: conns.map((c) => `- ${c.label}: ${c.capability} [${c.status}]`).join("\n"),
    history,
  };
}
