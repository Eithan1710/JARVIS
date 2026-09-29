import "server-only";
import { env } from "../../env";
import { AIError, type AIProvider, type AIRequest, type AIResponse, type ModelTier } from "../types";
import { timedFetch } from "./gemini";

interface CompatConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: () => string | undefined;
  model: (tier: ModelTier) => string;
  privacyNote: string;
  extraHeaders?: Record<string, string>;
}

/** Any OpenAI-compatible chat completions API (Groq, OpenRouter, …). */
export class OpenAICompatibleProvider implements AIProvider {
  constructor(private cfg: CompatConfig) {}
  get id() {
    return this.cfg.id;
  }
  get label() {
    return this.cfg.label;
  }
  get privacyNote() {
    return this.cfg.privacyNote;
  }
  available() {
    return Boolean(this.cfg.apiKey());
  }
  modelFor(tier: ModelTier) {
    return this.cfg.model(tier);
  }

  async generate(req: AIRequest): Promise<AIResponse> {
    const key = this.cfg.apiKey();
    if (!key) throw new AIError("not_configured", "api key missing", this.id);
    const model = this.modelFor(req.tier);
    const res = await timedFetch(
      `${this.cfg.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...this.cfg.extraHeaders },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          temperature: req.temperature ?? 0.4,
          max_tokens: req.maxOutputTokens ?? 4096,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      req.timeoutMs ?? 55_000,
      this.id,
    );
    if (!res.ok) {
      if (res.status === 429) throw new AIError("rate_limit", "rate limited", this.id);
      if (res.status === 401 || res.status === 403) throw new AIError("auth", `auth failed (${res.status})`, this.id);
      if (res.status >= 500) throw new AIError("unavailable", `server error ${res.status}`, this.id);
      throw new AIError("bad_response", `http ${res.status}`, this.id);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new AIError("bad_response", "empty response", this.id);
    return { text, provider: this.id, model, usage: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens } };
  }
}

export const groqProvider = () =>
  new OpenAICompatibleProvider({
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: () => env().GROQ_API_KEY,
    model: (t) => (t === "fast" ? env().GROQ_MODEL_FAST : env().GROQ_MODEL_DEEP),
    privacyNote: "Groq מעבדת את הבקשות בשרתים שלה; בדוק את תנאי השימוש לגבי שמירת נתונים.",
  });

export const openRouterProvider = () =>
  new OpenAICompatibleProvider({
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: () => env().OPENROUTER_API_KEY,
    model: () => env().OPENROUTER_MODEL,
    privacyNote: "OpenRouter מעביר את הבקשה לספק מודל חיצוני; מודלים חינמיים עשויים לשמור נתונים.",
    extraHeaders: { "X-Title": "NOVA" },
  });
