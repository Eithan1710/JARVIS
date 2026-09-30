import "server-only";
import { z } from "zod";
import type { Chip, ClientAction, Step, StreamEvent } from "@/lib/protocol";
import { extractJson, generate } from "../ai/router";
import type { AIMessage } from "../ai/types";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { toolCalls } from "../db/schema";
import { logger } from "../logger";
import { clip } from "../services/text";
import { getTool, toolsFor } from "../tools/registry";
import type { ToolResult } from "../tools/types";
import { buildLifeContext, timeBlock } from "./context";
import { leaderSystemPrompt, MAX_ROUNDS } from "./prompts";
import { runWorker } from "./workers";

const log = logger("leader");

const workerSchema = z.object({
  title: z.string().default("עובד על זה"),
  role: z.string().min(10),
  task: z.string().min(3),
  context: z.string().optional().default(""),
  speed: z.enum(["fast", "deep"]).catch("deep").optional(),
  provider: z.string().optional(),
});

const actionSchema = z.union([
  z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()).nullish() }),
  z.object({ worker: workerSchema }),
]);

const decisionSchema = z.object({
  actions: z.array(z.unknown()).nullish(),
  reply: z.string().nullish(),
  final: z.boolean().nullish(),
});

export interface LeaderDecision {
  actions: z.infer<typeof actionSchema>[];
  invalid: string[];
  reply: string | null;
  final: boolean;
}

/** Parse the Leader's JSON, tolerating sloppy output (plain text becomes the reply). */
export function parseDecision(text: string): LeaderDecision {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    const t = text.trim();
    return { actions: [], invalid: [], reply: t && !t.startsWith("{") ? t : null, final: true };
  }
  const d = decisionSchema.safeParse(raw);
  if (!d.success) return { actions: [], invalid: ["top-level object"], reply: null, final: false };
  const actions: LeaderDecision["actions"] = [];
  const invalid: string[] = [];
  for (const a of d.data.actions ?? []) {
    const p = actionSchema.safeParse(a);
    if (p.success) actions.push(p.data);
    else invalid.push(clip(JSON.stringify(a), 200));
  }
  const reply = d.data.reply?.trim() || null;
  return { actions, invalid, reply, final: d.data.final ?? actions.length === 0 };
}

export interface LeaderOutcome {
  reply: string;
  steps: Step[];
  actions: ClientAction[];
  chips: Chip[];
  provider?: string;
  model?: string;
  rounds: number;
  toolsUsed: string[];
}

interface Observation {
  n: number;
  label: string;
  ok: boolean;
  payload: unknown;
  /** Full worker text for {{result:N}} substitution. */
  text?: string;
}

/**
 * The Leader loop: think → (tools / workers in parallel) → observe → … → answer.
 * Every step is streamed as a subtle status line and every call is recorded in history.
 */
export async function runLeader(
  ctx: UserContext,
  input: { conversationId: string; messageId: string; text: string; voice: boolean },
  emit: (e: StreamEvent) => void,
): Promise<LeaderOutcome> {
  const life = await buildLifeContext(ctx, input.conversationId, input.text, input.messageId);
  const tools = toolsFor(ctx);
  const system = leaderSystemPrompt({ name: ctx.displayName, time: timeBlock(ctx), life, tools, voice: input.voice });
  const messages: AIMessage[] = mergeTurns([...life.history, { role: "user", content: input.text }]);
  if (messages[0]?.role === "assistant") messages.unshift({ role: "user", content: "(conversation start)" });

  const steps: Step[] = [];
  const clientActions: ClientAction[] = [];
  const chips: Chip[] = [];
  const observations: Observation[] = [];
  const toolsUsed: string[] = [];
  let provider: string | undefined;
  let model: string | undefined;

  const step = (s: Step) => {
    const i = steps.findIndex((x) => x.id === s.id);
    if (i >= 0) steps[i] = s;
    else steps.push(s);
    emit({ type: "step", step: s });
  };

  for (let round = 1; round <= MAX_ROUNDS + 1; round++) {
    const lastRound = round > MAX_ROUNDS;
    const res = await generate({
      role: "leader",
      system,
      messages: lastRound ? [...messages, { role: "user", content: "You are out of tool rounds. Answer the user now with what you have: {\"actions\": [], \"reply\": \"…\", \"final\": true}" }] : messages,
      json: true,
      temperature: 0.4,
      // Thinking models count reasoning against this budget; leave room for the JSON itself.
      maxOutputTokens: 8192,
      audit: { ctx, purpose: `leader:${round}`, conversationId: input.conversationId, messageId: input.messageId },
    });
    provider = res.provider;
    model = res.model;
    const d = parseDecision(res.text);
    messages.push({ role: "assistant", content: res.text.slice(0, 12_000) });

    if (!d.actions.length || lastRound) {
      if (d.reply) return finish(d.reply, round);
      if (d.invalid.length && !lastRound) {
        messages.push({ role: "user", content: `Your JSON had invalid actions: ${d.invalid.join("; ")}. Fix them or answer.` });
        continue;
      }
      return finish("סליחה, לא הצלחתי לנסח תשובה הפעם. אפשר לנסח שוב?", round);
    }

    // Run this round's actions in parallel.
    const results = await Promise.all(d.actions.map((a) => runAction(a)));
    const allOk = results.every((r) => r.ok) && !d.invalid.length;
    if (d.final && d.reply && allOk) return finish(d.reply, round);

    const obsText = results.map((o) => `[${o.n}] ${o.label} → ${o.ok ? "ok" : "FAILED"}: ${clip(JSON.stringify(o.payload ?? null), o.text ? 9000 : 6000)}`).join("\n");
    messages.push({
      role: "user",
      content: `OBSERVATIONS (not visible to the user):\n${obsText}${d.invalid.length ? `\nInvalid actions ignored: ${d.invalid.join("; ")}` : ""}\n\nContinue: more actions if truly needed, otherwise the final reply.`,
    });
  }
  return finish("סליחה, משהו השתבש באמצע. אפשר לנסות שוב?", MAX_ROUNDS);

  function finish(reply: string, rounds: number): LeaderOutcome {
    const text = reply.replace(/\{\{\s*result:(\d+)\s*\}\}/g, (_m, n) => observations.find((o) => o.n === Number(n))?.text ?? "").trim();
    return { reply: text, steps, actions: dedupeActions(clientActions), chips, provider, model, rounds, toolsUsed };
  }

  async function runAction(a: LeaderDecision["actions"][number]): Promise<Observation> {
    const n = observations.length + 1;
    const placeholder: Observation = { n, label: "", ok: false, payload: null };
    observations.push(placeholder);
    const id = `${input.messageId.slice(0, 8)}-${n}`;
    const started = Date.now();

    if ("worker" in a) {
      const w = a.worker;
      placeholder.label = `worker "${w.title}"`;
      step({ id, kind: "worker", label: `${w.title.replace(/[.…]+$/, "")}…`, state: "running" });
      const out = await runWorker(ctx, w, { conversationId: input.conversationId, messageId: input.messageId });
      step({ id, kind: "worker", label: w.title.replace(/[.…]+$/, ""), state: out.ok ? "done" : "error", detail: `worker · ${out.provider ?? "—"}/${out.model ?? "—"} · ${(out.ms / 1000).toFixed(1)}s` });
      Object.assign(placeholder, { ok: out.ok, payload: out.ok ? out.output : out.error, text: out.output });
      return placeholder;
    }

    const tool = getTool(ctx, a.tool);
    placeholder.label = `tool ${a.tool}`;
    if (!tool) {
      Object.assign(placeholder, { ok: false, payload: `unknown tool "${a.tool}"` });
      return placeholder;
    }
    const parsed = tool.params.safeParse(a.args ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      Object.assign(placeholder, { ok: false, payload: `invalid args — ${issues}. Signature: ${tool.signature}` });
      return placeholder;
    }
    const args = parsed.data as never;
    step({ id, kind: "tool", label: tool.status(args), state: "running" });
    let result: ToolResult;
    try {
      result = await tool.run(args, { ctx, conversationId: input.conversationId, messageId: input.messageId });
    } catch (e) {
      log.warn("tool threw", { tool: tool.name, error: e instanceof Error ? e.message.slice(0, 200) : "error" });
      result = { ok: false, error: "the tool failed unexpectedly" };
    }
    const ms = Date.now() - started;
    toolsUsed.push(tool.name);
    step({ id, kind: "tool", label: tool.status(args).replace(/…$/, ""), state: result.ok ? "done" : "error", detail: `${tool.name} · ${ms}ms` });
    if (result.ok && result.action) {
      clientActions.push(result.action);
      emit({ type: "action", action: result.action });
    }
    if (result.ok && result.chip) {
      chips.push(result.chip);
      emit({ type: "chip", chip: result.chip });
    }
    void recordToolCall(ctx, input, tool.name, a.args ?? {}, result, ms);
    Object.assign(placeholder, { ok: result.ok, payload: result.ok ? result.data ?? "done" : result.error ?? "failed" });
    if (!result.ok && result.data) placeholder.payload = { error: result.error, data: result.data };
    return placeholder;
  }
}

/** Some providers reject consecutive messages from the same role; merge them. */
export function mergeTurns(list: AIMessage[]): AIMessage[] {
  const out: AIMessage[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else out.push({ ...m });
  }
  return out;
}

function dedupeActions(a: ClientAction[]): ClientAction[] {
  const seen = new Set<string>();
  return a.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
}

async function recordToolCall(ctx: UserContext, input: { conversationId: string; messageId: string }, tool: string, args: unknown, result: ToolResult, ms: number) {
  try {
    const db = await getDb();
    await db.insert(toolCalls).values({
      userId: ctx.userId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      tool,
      args: args as Record<string, unknown>,
      result: { data: result.data ?? null, action: result.action ?? null, chip: result.chip ?? null } as Record<string, unknown>,
      status: result.ok ? "ok" : "error",
      error: result.error ?? null,
      latencyMs: ms,
    });
  } catch (e) {
    log.warn("tool call not recorded", { tool, error: e instanceof Error ? e.message.slice(0, 200) : "error" });
  }
}
