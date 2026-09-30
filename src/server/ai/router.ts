import "server-only";
import { sql } from "drizzle-orm";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { aiProviders, prompts } from "../db/schema";
import { errorInfo, logger } from "../logger";
import { GeminiProvider } from "./providers/gemini";
import { extraProvider, groqProvider, mistralProvider } from "./providers/openai-compatible";
import { AIError, type AIMessage, type AIProvider, type AIRequest, type AIResponse, type AIRole, type ModelSize } from "./types";

const log = logger("ai");

/* ───────────────────────────── provider registry ───────────────────────────── */

let override: AIProvider[] | null = null;
/** Test hook: replace the provider set. */
export function setProviderOverride(p: AIProvider[] | null) {
  override = p;
  cooldowns.clear();
}

export function allProviders(): AIProvider[] {
  if (override) return override;
  return [new GeminiProvider(), groqProvider(), mistralProvider(), extraProvider()];
}

export function availableProviders(): AIProvider[] {
  return allProviders().filter((p) => p.available());
}

export function aiConfigured(): boolean {
  return availableProviders().length > 0;
}

/**
 * Role → preferred chain of (provider, size). Unavailable or cooling-down providers are skipped,
 * so any subset of keys works. New providers only need an entry here.
 */
const ROUTES: Record<AIRole, [string, ModelSize][]> = {
  // The Leader: best tool-use + Hebrew. Gemini first; others keep JARVIS alive when it's rate limited.
  leader: [
    ["gemini", "large"],
    ["mistral", "large"],
    ["groq", "large"],
    ["extra", "large"],
    ["gemini", "small"],
  ],
  // Background chores (memory extraction, titles): cheap and fast, keep the Leader's quota free.
  light: [
    ["groq", "small"],
    ["gemini", "small"],
    ["mistral", "small"],
    ["extra", "large"],
  ],
  worker_fast: [
    ["groq", "large"],
    ["gemini", "small"],
    ["mistral", "small"],
    ["extra", "large"],
  ],
  worker_deep: [
    ["mistral", "large"],
    ["groq", "large"],
    ["gemini", "large"],
    ["extra", "large"],
  ],
};

export function routeFor(role: AIRole, prefer?: string): { provider: AIProvider; model: string }[] {
  const byId = new Map(availableProviders().map((p) => [p.id, p]));
  let chain = ROUTES[role];
  if (prefer && byId.has(prefer)) {
    const size: ModelSize = role === "light" ? "small" : "large";
    chain = [[prefer, size], ...chain.filter(([id]) => id !== prefer)];
  }
  const out: { provider: AIProvider; model: string }[] = [];
  const seen = new Set<string>();
  for (const [id, size] of chain) {
    const p = byId.get(id);
    if (!p) continue;
    const model = p.model(size);
    const key = `${id}:${model}`;
    if (!model || seen.has(key)) continue;
    seen.add(key);
    out.push({ provider: p, model });
  }
  // Any configured provider not named in the route is a last resort.
  for (const p of byId.values()) {
    if (!out.some((o) => o.provider.id === p.id)) out.push({ provider: p, model: p.model("large") });
  }
  return out;
}

/* ─────────────────────────────── cooldowns ─────────────────────────────────── */

// In-memory mirror of ai_providers.cooldown_until, refreshed from the DB at most every 20s.
const cooldowns = new Map<string, number>();
let cooldownsLoadedAt = 0;

async function refreshCooldowns() {
  if (override || Date.now() - cooldownsLoadedAt < 20_000) return;
  cooldownsLoadedAt = Date.now();
  try {
    const db = await getDb();
    const rows = await db.select({ id: aiProviders.id, until: aiProviders.cooldownUntil }).from(aiProviders);
    for (const r of rows) {
      if (r.until && r.until.getTime() > Date.now()) cooldowns.set(r.id, r.until.getTime());
    }
  } catch {
    /* best effort */
  }
}

function coolingDown(id: string) {
  const until = cooldowns.get(id);
  return until !== undefined && until > Date.now();
}

async function recordProvider(p: AIProvider, ok: boolean, err?: AIError) {
  if (override) {
    if (err?.kind === "rate_limit") cooldowns.set(p.id, Date.now() + 60_000);
    return;
  }
  try {
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    const cooldownUntil = err?.kind === "rate_limit" ? new Date(Date.now() + 60_000) : err?.kind === "auth" ? new Date(Date.now() + 10 * 60_000) : null;
    if (cooldownUntil) cooldowns.set(p.id, cooldownUntil.getTime());
    await db
      .insert(aiProviders)
      .values({ id: p.id, label: p.label, day: today, requestsToday: 1, lastOkAt: ok ? new Date() : null, lastError: err ? `${err.kind}: ${err.message}`.slice(0, 300) : null, cooldownUntil })
      .onConflictDoUpdate({
        target: aiProviders.id,
        set: {
          label: p.label,
          requestsToday: sql`CASE WHEN ${aiProviders.day} = ${today}::date THEN ${aiProviders.requestsToday} + 1 ELSE 1 END`,
          day: today,
          ...(ok ? { lastOkAt: new Date(), cooldownUntil: null } : { lastError: err ? `${err.kind}: ${err.message}`.slice(0, 300) : null }),
          ...(cooldownUntil ? { cooldownUntil } : {}),
        },
      });
  } catch (e) {
    log.warn("provider state not recorded", errorInfo(e));
  }
}

/* ─────────────────────────────── generation ────────────────────────────────── */

export interface Audit {
  ctx: UserContext;
  purpose: string;
  conversationId?: string | null;
  messageId?: string | null;
}

export interface GenerateOptions extends AIRequest {
  role: AIRole;
  /** Provider id to try first (e.g. the Leader asked a Worker to run on Mistral). */
  prefer?: string;
  audit: Audit;
}

/** Try the role's provider chain in order, failing over on rate limits and outages. Every attempt is logged. */
export async function generate(o: GenerateOptions): Promise<AIResponse> {
  await refreshCooldowns();
  const chain = routeFor(o.role, o.prefer);
  if (!chain.length) throw new AIError("not_configured", "no AI provider configured");
  const ready = chain.filter((c) => !coolingDown(c.provider.id));
  const attempts = ready.length ? ready : chain; // everything cooling down → try anyway
  let last: AIError | null = null;
  for (const { provider, model } of attempts) {
    const started = Date.now();
    try {
      const res = await provider.generate({ ...o, model });
      void recordProvider(provider, true);
      await auditPrompt(o, { status: "ok", res, ms: Date.now() - started });
      return res;
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError("unavailable", e instanceof Error ? e.message : String(e), provider.id);
      last = err;
      log.warn("provider failed", { provider: provider.id, model, kind: err.kind });
      void recordProvider(provider, false, err);
      await auditPrompt(o, { status: "error", provider: provider.id, model, err, ms: Date.now() - started });
      if (!err.retryable) break;
    }
  }
  throw last ?? new AIError("unavailable", "all providers failed");
}

async function auditPrompt(
  o: GenerateOptions,
  r: { status: "ok" | "error"; res?: AIResponse; provider?: string; model?: string; err?: AIError; ms: number },
) {
  try {
    const db = await getDb();
    await db.insert(prompts).values({
      userId: o.audit.ctx.userId,
      conversationId: o.audit.conversationId ?? null,
      messageId: o.audit.messageId ?? null,
      purpose: o.audit.purpose,
      provider: r.res?.provider ?? r.provider ?? null,
      model: r.res?.model ?? r.model ?? null,
      system: o.system,
      input: o.messages as AIMessage[],
      output: r.res?.text ?? null,
      status: r.status,
      error: r.err ? `${r.err.kind}: ${r.err.message}`.slice(0, 500) : null,
      inputTokens: r.res?.usage?.input ?? null,
      outputTokens: r.res?.usage?.output ?? null,
      latencyMs: r.ms,
    });
  } catch (e) {
    log.warn("prompt audit failed", errorInfo(e));
  }
}

/** Speech-to-text across providers that support it (Groq Whisper first, Gemini as fallback). */
export async function transcribe(audio: Blob, opts: { language?: string; filename?: string; audit: Audit }): Promise<{ text: string; provider: string }> {
  const order = ["groq", "gemini", ...availableProviders().map((p) => p.id)];
  const providers = [...new Set(order)]
    .map((id) => availableProviders().find((p) => p.id === id))
    .filter((p): p is AIProvider => Boolean(p?.transcribe));
  if (!providers.length) throw new AIError("not_configured", "no transcription provider");
  let last: AIError | null = null;
  for (const p of providers) {
    const started = Date.now();
    try {
      const r = await p.transcribe!(audio, opts);
      await auditPrompt(
        { role: "light", system: "transcribe", messages: [{ role: "user", content: `[audio ${audio.size} bytes, ${audio.type}]` }], audit: opts.audit },
        { status: "ok", res: { text: r.text, provider: p.id, model: r.model }, ms: Date.now() - started },
      );
      return { text: r.text, provider: p.id };
    } catch (e) {
      last = e instanceof AIError ? e : new AIError("unavailable", String(e), p.id);
      log.warn("transcription failed", { provider: p.id, kind: last.kind });
    }
  }
  throw last ?? new AIError("unavailable", "transcription failed");
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
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new AIError("bad_response", "response was not JSON");
  }
}

export async function providerStatus() {
  const db = await getDb();
  const rows = await db.select().from(aiProviders);
  return allProviders().map((p) => {
    const r = rows.find((x) => x.id === p.id);
    return {
      id: p.id,
      label: p.label,
      configured: p.available(),
      coolingDown: Boolean(r?.cooldownUntil && r.cooldownUntil > new Date()),
      requestsToday: r?.day === new Date().toISOString().slice(0, 10) ? r.requestsToday : 0,
      lastError: r?.lastError ?? null,
    };
  });
}

export function aiErrorMessage(e: unknown): string {
  const kind = e instanceof AIError ? e.kind : "unavailable";
  switch (kind) {
    case "not_configured":
      return "עוד לא חיברו אותי למודל AI. צריך להגדיר מפתח Gemini (חינמי) בשרת.";
    case "rate_limit":
      return "הגעתי למכסת השימוש החינמית לעכשיו. נסה שוב בעוד דקה.";
    case "blocked":
      return "לא אוכל לעזור בבקשה הזו.";
    case "timeout":
      return "זה לקח יותר מדי זמן. ננסה שוב?";
    default:
      return "משהו השתבש אצלי. נסה שוב בעוד רגע.";
  }
}

