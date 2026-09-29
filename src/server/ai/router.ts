import "server-only";
import type { ZodType } from "zod";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { aiTasks } from "../db/schema";
import { env } from "../env";
import { errorInfo, logger } from "../logger";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { groqProvider, openRouterProvider } from "./providers/openai-compatible";
import { AIError, type AIMessage, type AIProvider, type AIResponse, type ModelTier } from "./types";

const log = logger("ai");

let override: AIProvider[] | null = null;
/** Test hook: replace the provider chain. */
export function setProviderOverride(p: AIProvider[] | null) {
  override = p;
}

export function allProviders(): AIProvider[] {
  if (override) return override;
  const byId: Record<string, () => AIProvider> = {
    gemini: () => new GeminiProvider(),
    groq: groqProvider,
    openrouter: openRouterProvider,
    anthropic: () => new AnthropicProvider(),
  };
  return env()
    .AI_PROVIDER_ORDER.split(",")
    .map((s) => s.trim())
    .filter((id) => byId[id])
    .map((id) => byId[id]());
}

export function availableProviders(): AIProvider[] {
  return allProviders().filter((p) => p.available());
}

export function aiConfigured(): boolean {
  return availableProviders().length > 0;
}

/** Try providers in order, falling through on rate limits and outages (free tiers hit limits). */
export async function generate(req: Parameters<AIProvider["generate"]>[0]): Promise<AIResponse> {
  const providers = availableProviders();
  if (!providers.length) throw new AIError("not_configured", "no AI provider configured");
  let last: AIError | null = null;
  for (const p of providers) {
    try {
      return await p.generate(req);
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError("unavailable", e instanceof Error ? e.message : String(e), p.id);
      last = err;
      log.warn("provider failed", { provider: p.id, kind: err.kind });
      if (!err.retryable) break;
    }
  }
  throw last ?? new AIError("unavailable", "all providers failed");
}

/** Extract a JSON object from model text (tolerates code fences and leading prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new AIError("bad_response", "response was not JSON");
  }
}

export interface TaskOptions<T> {
  ctx: UserContext;
  type: string;
  tier: ModelTier;
  system: string;
  messages: AIMessage[];
  schema: ZodType<T>;
  /** Categories + counts of personal data included (for the privacy audit log). */
  dataScope: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface TaskResult<T> {
  value: T;
  provider: string;
  model: string;
  taskId: string;
}

/**
 * Run a structured AI task: call → parse → validate → (one repair attempt) → audit log.
 * Throws AIError on failure; callers decide on deterministic fallbacks.
 */
export async function runStructuredTask<T>(o: TaskOptions<T>): Promise<TaskResult<T>> {
  if (!o.ctx.settings.ai.enabled) throw new AIError("disabled", "AI disabled in settings");
  const started = Date.now();
  const contextChars = o.system.length + o.messages.reduce((s, m) => s + m.content.length, 0);
  let res: AIResponse | null = null;
  try {
    res = await generate({ system: o.system, messages: o.messages, tier: o.tier, json: true, temperature: o.temperature, maxOutputTokens: o.maxOutputTokens });
    let parsed = o.schema.safeParse(safeExtract(res.text));
    if (!parsed.success) {
      // One repair round on the fast tier: give the model its own output and the validation issues.
      const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
      const repair = await generate({
        system: "You fix JSON so it matches the required structure. Output only the corrected JSON object. Keep all text in Hebrew.",
        messages: [{ role: "user", content: `Original instructions (abridged):\n${o.system.slice(0, 3000)}\n\nInvalid JSON:\n${res.text.slice(0, 12000)}\n\nValidation issues:\n${issues}` }],
        tier: "fast",
        json: true,
        temperature: 0,
      });
      parsed = o.schema.safeParse(safeExtract(repair.text));
      if (!parsed.success) throw new AIError("bad_response", "response failed validation", res.provider);
    }
    const taskId = await audit(o, "ok", res, Date.now() - started, contextChars);
    return { value: parsed.data, provider: res.provider, model: res.model, taskId };
  } catch (e) {
    const err = e instanceof AIError ? e : new AIError("unavailable", e instanceof Error ? e.message : String(e));
    await audit(o, "failed", res, Date.now() - started, contextChars, err).catch(() => {});
    log.warn("task failed", { type: o.type, kind: err.kind, ...errorInfo(err) });
    throw err;
  }
}

function safeExtract(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}

async function audit(o: TaskOptions<unknown>, status: "ok" | "failed", res: AIResponse | null, ms: number, chars: number, err?: AIError) {
  const db = await getDb();
  const [row] = await db
    .insert(aiTasks)
    .values({
      userId: o.ctx.userId,
      type: o.type,
      status,
      provider: res?.provider ?? err?.provider ?? null,
      model: res?.model ?? null,
      tier: o.tier,
      dataScope: o.dataScope,
      contextChars: chars,
      inputTokens: res?.usage?.input ?? null,
      outputTokens: res?.usage?.output ?? null,
      latencyMs: ms,
      error: err ? `${err.kind}: ${err.message}`.slice(0, 300) : null,
    })
    .returning({ id: aiTasks.id });
  return row.id;
}

export function aiErrorMessage(e: unknown): string {
  const kind = e instanceof AIError ? e.kind : "unavailable";
  switch (kind) {
    case "not_configured":
      return "עדיין לא הוגדר מפתח AI. אפשר להוסיף מפתח Gemini חינמי בהגדרות.";
    case "disabled":
      return "ה־AI כבוי בהגדרות.";
    case "rate_limit":
      return "הגעת למכסת השימוש החינמית של ה־AI לעכשיו. נסה שוב בעוד כמה דקות.";
    case "blocked":
      return "ספק ה־AI סירב לענות על הבקשה הזו.";
    case "timeout":
      return "ה־AI לא הגיב בזמן. נסה שוב.";
    default:
      return "ה־AI לא זמין כרגע.";
  }
}
