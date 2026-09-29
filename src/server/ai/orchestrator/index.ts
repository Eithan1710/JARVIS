import "server-only";
/**
 * The AI Orchestrator.
 *
 *   question → intent → plan → tools (deterministic analytics) → context → model →
 *   validation → structured answer (+ evidence) → stored message
 *
 * The model never touches the database and never sees more than the facts selected for
 * this question.
 */
import { asc, desc, eq, and } from "drizzle-orm";
import type { UserContext } from "../../context";
import { getDb } from "../../db/client";
import { aiConversations, aiMessages } from "../../db/schema";
import { notFound } from "../../api/handler";
import { makeLookup, type EvidenceBlock } from "../../analytics/compare";
import { loadFrame } from "../../services/frame";
import { listHabits } from "../../services/habits";
import { proposeMemories } from "../../services/memory";
import { errorInfo, logger } from "../../logger";
import { aiConfigured, aiErrorMessage, runStructuredTask } from "../router";
import { answerSchema, buildContext, fallbackAnswer, SYSTEM_PROMPT, verifyAnswer, type AnswerPayload } from "./context";
import { detectIntent } from "./intent";
import { aiPlan, rulePlan } from "./planner";
import { runTool, type Fact, type ToolOutput } from "./tools";

const log = logger("orchestrator");

export type StepEvent = { type: "step"; id: string; label: string; status: "active" | "done" };

export interface StoredAnswer extends AnswerPayload {
  facts: Pick<Fact, "id" | "text" | "kind" | "tool">[];
  evidenceBlocks: EvidenceBlock[];
  plan: { tools: string[]; range: { from: string; to: string; label: string }; type: string; domains: string[]; planner: string; tier: string };
  mode: "ai" | "fallback";
  model?: string;
  provider?: string;
  notice?: string;
  proposedMemoryIds: string[];
  dataScope: Record<string, number>;
}

const TOOL_LABELS: Record<string, string> = {
  get_metric_summary: "מדדים",
  compare_periods: "השוואת תקופות",
  find_relationships: "חיפוש קשרים",
  get_habits: "הרגלים",
  get_habit_history: "היסטוריית הרגל",
  get_goals: "מטרות",
  get_checkins: "צ׳ק־אין",
  get_journal_entries: "יומן",
  get_spending: "הוצאות",
  get_calendar_load: "יומן פגישות",
  get_upcoming: "אירועים קרובים",
  search_personal_memory: "זיכרון",
  get_insights: "תובנות",
  compare_best_weeks: "השבועות הטובים",
  get_week_rhythm: "קצב שבועי",
  get_timeline: "ציר זמן",
};

export async function ensureConversation(ctx: UserContext, conversationId: string | null | undefined, firstQuestion: string) {
  const db = await getDb();
  if (conversationId) {
    const [c] = await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, ctx.userId)))
      .limit(1);
    if (c) return c;
  }
  const title = firstQuestion.length > 60 ? `${firstQuestion.slice(0, 57)}…` : firstQuestion;
  const [c] = await db.insert(aiConversations).values({ userId: ctx.userId, title }).returning();
  return c;
}

export async function ask(
  ctx: UserContext,
  input: { question: string; conversationId?: string | null },
  emit: (e: StepEvent) => void = () => {},
): Promise<{ conversationId: string; message: typeof aiMessages.$inferSelect }> {
  const db = await getDb();
  const question = input.question.trim();
  const convo = await ensureConversation(ctx, input.conversationId, question);
  await db.insert(aiMessages).values({ conversationId: convo.id, role: "user", content: question });

  // Recent turns for follow-ups ("ומה לגבי שינה?").
  const history = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, convo.id))
    .orderBy(desc(aiMessages.createdAt))
    .limit(7);
  const prior = history.slice(1).reverse();

  /* 1. Intent */
  emit({ type: "step", id: "intent", label: "מבין את השאלה", status: "active" });
  const habitRows = await listHabits(ctx);
  const contextual = prior.length && question.length < 40 ? `${prior.filter((m) => m.role === "user").slice(-1)[0]?.content ?? ""} ${question}` : question;
  const intent = detectIntent(contextual, ctx.today, habitRows.map((h) => ({ id: h.id, name: h.name })));
  emit({ type: "step", id: "intent", label: "מבין את השאלה", status: "done" });

  /* 2–3. Plan */
  const plan = rulePlan(intent, question, ctx.today);
  let planner: "rules" | "ai" = "rules";
  if (!intent.domains.length && intent.type === "general" && question.length > 12) {
    const aiCalls = await aiPlan(ctx, question, intent);
    if (aiCalls) {
      plan.calls = [plan.calls[0], ...aiCalls];
      planner = "ai";
    }
  }

  /* 4–5. Retrieve + analyse */
  const labels = [...new Set(plan.calls.map((c) => TOOL_LABELS[c.name]).filter(Boolean))];
  emit({ type: "step", id: "data", label: `אוסף נתונים: ${labels.slice(0, 4).join(", ")}`, status: "active" });
  const loaded = await loadFrame(ctx, plan.frameFrom, ctx.today);
  const env = { ctx, frame: loaded.frame, lookup: makeLookup(loaded.habitNames, loaded.custom), habitNames: loaded.habitNames };
  const outputs: ToolOutput[] = [];
  for (const call of plan.calls) {
    try {
      outputs.push(await runTool(env, call));
    } catch (e) {
      log.warn("tool failed", { tool: call.name, ...errorInfo(e) });
    }
  }
  emit({ type: "step", id: "data", label: `אוסף נתונים: ${labels.slice(0, 4).join(", ")}`, status: "done" });

  /* 6. Context */
  emit({ type: "step", id: "analyze", label: "מחשב השוואות ודפוסים", status: "active" });
  const memoryLines = prior.map((m) => `${m.role === "user" ? "User" : "NOVA"}: ${m.content.slice(0, 400)}`);
  const built = buildContext(outputs, intent, ctx.today, memoryLines);
  emit({ type: "step", id: "analyze", label: "מחשב השוואות ודפוסים", status: "done" });

  /* 7–9. Model + validation (or deterministic fallback) */
  let answer: AnswerPayload;
  let mode: StoredAnswer["mode"] = "fallback";
  let model: string | undefined;
  let provider: string | undefined;
  let notice: string | undefined;
  let taskId: string | undefined;
  if (aiConfigured() && ctx.settings.ai.enabled) {
    emit({ type: "step", id: "ai", label: "מנסח תשובה", status: "active" });
    try {
      const res = await runStructuredTask({
        ctx,
        type: "ask",
        tier: plan.tier,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${built.text}\n\nUSER QUESTION: ${question}` }],
        schema: answerSchema,
        dataScope: { ...built.scope, notesIncluded: built.textCount, tools: outputs.length },
        temperature: 0.3,
      });
      const verified = verifyAnswer(res.value, built.facts);
      answer = verified;
      mode = "ai";
      model = res.model;
      provider = res.provider;
      taskId = res.taskId;
    } catch (e) {
      notice = aiErrorMessage(e);
      answer = fallbackAnswer(built.facts, notice);
    }
    emit({ type: "step", id: "ai", label: "מנסח תשובה", status: "done" });
  } else {
    notice = ctx.settings.ai.enabled ? "עדיין לא הוגדר מפתח AI, אז אין ניסוח חופשי." : "ה־AI כבוי בהגדרות.";
    answer = fallbackAnswer(built.facts, notice);
  }

  /* Memory proposals — never auto-activated */
  let proposedMemoryIds: string[] = [];
  if (answer.memoryProposals.length) {
    const rows = await proposeMemories(
      ctx,
      answer.memoryProposals.map((m) => ({ kind: m.kind, content: m.content, confidence: m.basis === "user_stated" ? "high" : "medium" })),
      "ai_conversation",
      { conversationId: convo.id },
    );
    proposedMemoryIds = rows.map((r) => r.id);
  }

  const citedIds = new Set(answer.points.flatMap((p) => p.evidence));
  const stored: StoredAnswer = {
    ...answer,
    facts: built.facts.filter((f) => citedIds.has(f.id) || f.kind !== "fact").slice(0, 40).map(({ id, text, kind, tool }) => ({ id, text, kind, tool })),
    evidenceBlocks: outputs.flatMap((o) => o.evidence).slice(0, 12),
    plan: {
      tools: plan.calls.map((c) => c.name),
      range: { from: intent.range.from, to: intent.range.to, label: intent.range.label },
      type: intent.type,
      domains: intent.domains,
      planner,
      tier: plan.tier,
    },
    mode,
    model,
    provider,
    notice,
    proposedMemoryIds,
    dataScope: built.scope,
  };

  const [message] = await db
    .insert(aiMessages)
    .values({ conversationId: convo.id, role: "assistant", content: answer.answer, structured: stored as unknown as Record<string, unknown>, taskId })
    .returning();
  await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, convo.id));
  return { conversationId: convo.id, message };
}

export async function listConversations(ctx: UserContext) {
  const db = await getDb();
  return db.select().from(aiConversations).where(eq(aiConversations.userId, ctx.userId)).orderBy(desc(aiConversations.updatedAt)).limit(50);
}

export async function getConversation(ctx: UserContext, id: string) {
  const db = await getDb();
  const [c] = await db.select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, ctx.userId))).limit(1);
  if (!c) throw notFound("השיחה");
  const messages = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.createdAt));
  return { conversation: c, messages };
}

export async function deleteConversation(ctx: UserContext, id: string) {
  const db = await getDb();
  await db.delete(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, ctx.userId)));
}
