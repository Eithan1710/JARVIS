import "server-only";
/**
 * Step 2–3 of the orchestrator: decide which data is relevant and which tools to run.
 * Rule-based first (deterministic, zero AI cost); an LLM planner is consulted only when the
 * question does not map to any known domain.
 */
import { z } from "zod";
import { addDays, type ISODate } from "@/lib/dates";
import type { UserContext } from "../../context";
import { aiConfigured, runStructuredTask } from "../router";
import type { ModelTier } from "../types";
import { DOMAIN_KEYS, type Intent } from "./intent";
import { TOOLS, toolCatalog, type ToolCall, type ToolName } from "./tools";

export interface Plan {
  calls: ToolCall[];
  tier: ModelTier;
  /** Outer bounds of data needed, to load the Day Frame once. */
  frameFrom: ISODate;
  planner: "rules" | "ai";
}

const CORE = ["sleep_hours", "exercised", "habit_rate", "main_habit_rate", "mood", "energy", "focus", "steps", "work_hours", "meetings"];
const FACTORS = ["sleep_hours", "bedtime", "meetings", "calendar_hours", "work_hours", "steps", "mood", "energy", "screen_time_hours"];

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function rulePlan(intent: Intent, question: string, today: ISODate): Omit<Plan, "planner"> {
  const calls: ToolCall[] = [];
  const add = (name: ToolName, args: unknown) => {
    if (!calls.some((c) => c.name === name && JSON.stringify(c.args) === JSON.stringify(args))) calls.push({ name, args });
  };
  const { from, to } = intent.range;
  const outcomes = uniq(intent.domains.flatMap((d) => DOMAIN_KEYS[d])).slice(0, 4);
  const primary = outcomes[0];

  add("search_personal_memory", { query: question });

  switch (intent.type) {
    case "explain":
    case "change": {
      const recent = { from, to };
      const baseline = intent.baseline ?? { from: addDays(from, -56), to: addDays(from, -1) };
      add("compare_periods", {
        keys: uniq([...outcomes, ...FACTORS]).slice(0, 10),
        recent,
        baseline,
        recentLabel: intent.range.label,
        baselineLabel: intent.baseline?.label,
      });
      if (primary) add("find_relationships", { outcome: primary, from: baseline.from, to, habitIds: intent.habitIds });
      add("get_calendar_load", { from: baseline.from, to });
      add("get_checkins", { from, to });
      add("get_journal_entries", { from, to, query: question });
      for (const id of intent.habitIds.slice(0, 2)) add("get_habit_history", { habitId: id, from: baseline.from, to });
      break;
    }
    case "relationship": {
      for (const o of (outcomes.length ? outcomes : ["habit_rate"]).slice(0, 2)) add("find_relationships", { outcome: o, from, to, habitIds: intent.habitIds });
      add("get_metric_summary", { keys: outcomes.length ? outcomes : ["habit_rate", "mood"], from, to });
      break;
    }
    case "discovery": {
      add("get_insights", { limit: 8 });
      add("compare_best_weeks", { outcome: primary ?? "habit_rate", from, to });
      add("compare_periods", { keys: CORE, recent: { from: addDays(today, -27), to: today }, baseline: { from: addDays(today, -83), to: addDays(today, -28) } });
      add("get_habits", {});
      break;
    }
    case "when": {
      if (intent.habitIds.length) for (const id of intent.habitIds.slice(0, 2)) add("get_habit_history", { habitId: id, from, to });
      for (const o of outcomes.slice(0, 2)) {
        add("get_week_rhythm", { key: o, from, to });
        add("find_relationships", { outcome: o, from, to, habitIds: intent.habitIds });
      }
      if (!outcomes.length && !intent.habitIds.length) add("get_timeline", { from: addDays(today, -6), to: today });
      break;
    }
    case "aggregate":
    default: {
      if (intent.domains.includes("spending")) add("get_spending", { from, to, category: intent.spendingCategory });
      const metricKeys = outcomes.filter((k) => k !== "spending");
      if (metricKeys.length) add("get_metric_summary", { keys: metricKeys, from, to });
      if (intent.domains.includes("habits") || intent.habitIds.length) {
        add("get_habits", { habitIds: intent.habitIds.length ? intent.habitIds : undefined });
        for (const id of intent.habitIds.slice(0, 2)) add("get_habit_history", { habitId: id, from, to });
      }
      if (!intent.domains.length) {
        add("get_habits", {});
        add("get_goals", {});
        add("get_insights", { limit: 5 });
        add("get_metric_summary", { keys: CORE.slice(0, 7), from: addDays(today, -29), to: today });
        add("get_timeline", { from: addDays(today, -6), to: today });
      }
      break;
    }
  }

  if (intent.domains.includes("goals")) add("get_goals", {});
  if (intent.domains.includes("journal")) add("get_journal_entries", { from, to, query: question });
  if (intent.domains.includes("work") && intent.type !== "explain") add("get_calendar_load", { from, to });
  if (intent.domains.includes("spending") && !calls.some((c) => c.name === "get_spending")) add("get_spending", { from, to, category: intent.spendingCategory });
  if (intent.range.explicit && from >= addDays(to, -6) && !calls.some((c) => c.name === "get_timeline")) add("get_timeline", { from, to });

  const heavy = ["explain", "relationship", "discovery"].includes(intent.type) || calls.length >= 5;
  const tier: ModelTier = heavy ? "deep" : intent.type === "aggregate" || intent.type === "when" ? "fast" : "balanced";
  const earliest = calls
    .flatMap((c) => {
      const a = c.args as Record<string, unknown>;
      return [a.from, (a.baseline as { from?: string } | undefined)?.from, (a.recent as { from?: string } | undefined)?.from].filter((x): x is string => typeof x === "string");
    })
    .sort()[0];
  return { calls, tier, frameFrom: earliest && earliest < addDays(today, -119) ? earliest : addDays(today, -119) };
}

const plannerSchema = z.object({
  calls: z
    .array(z.object({ name: z.string(), args: z.record(z.string(), z.unknown()).default({}) }))
    .max(6),
});

/** LLM planner for questions the rules cannot map. Output is validated against the tool catalogue. */
export async function aiPlan(ctx: UserContext, question: string, intent: Intent): Promise<ToolCall[] | null> {
  if (!aiConfigured() || !ctx.settings.ai.enabled) return null;
  try {
    const { value } = await runStructuredTask({
      ctx,
      type: "plan",
      tier: "fast",
      system: `You plan data retrieval for a private personal-analytics assistant. Pick 1-5 tools that fetch the data needed to answer the user's question. Only use tools from this catalogue:\n${toolCatalog()}\n\nDay Frame keys: sleep_hours, bedtime, exercised, workout_minutes, steps, mood, energy, focus, habit_rate, main_habit_rate, work_hours, deep_work_hours, meetings, calendar_hours, spending, weight, study_minutes, screen_time_hours.\nDates are ISO (YYYY-MM-DD). Today is ${ctx.today}. Default range: ${intent.range.from}..${intent.range.to}.\nReturn JSON: {"calls":[{"name":"tool_name","args":{...}}]}`,
      messages: [{ role: "user", content: question }],
      schema: plannerSchema,
      dataScope: { question: 1 },
      temperature: 0,
    });
    const calls: ToolCall[] = [];
    for (const c of value.calls) {
      if (!(c.name in TOOLS)) continue;
      const def = TOOLS[c.name as ToolName];
      const parsed = (def.args as z.ZodType<unknown>).safeParse(c.args);
      if (parsed.success) calls.push({ name: c.name as ToolName, args: parsed.data });
    }
    return calls.length ? calls : null;
  } catch {
    return null;
  }
}
