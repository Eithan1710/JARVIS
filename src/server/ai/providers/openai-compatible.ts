import "server-only";
import { env } from "../../env";
import { AIError, type AIProvider, type AIRequest, type AIResponse, type ModelSize } from "../types";
import { httpError, timedFetch } from "./http";

interface CompatConfig {
  id: string;
  label: string;
  baseUrl: () => string | undefined;
  apiKey: () => string | undefined;
  model: (size: ModelSize) => string | undefined;
  /** Extra request-body fields for a given model (e.g. reasoning effort). */
  extraBody?: (model: string) => Record<string, unknown>;
  transcriptionModel?: () => string | undefined;
}

/** Any OpenAI-compatible chat completions API (Groq, Mistral, Cloudflare Workers AI, OpenRouter…). */
export class OpenAICompatibleProvider implements AIProvider {
  constructor(private cfg: CompatConfig) {}
  get id() {
    return this.cfg.id;
  }
  get label() {
    return this.cfg.label;
  }
  available() {
    return Boolean(this.cfg.apiKey() && this.cfg.baseUrl() && this.cfg.model("large"));
  }
  model(size: ModelSize) {
    return this.cfg.model(size) ?? this.cfg.model("large") ?? "";
  }

  async generate(req: AIRequest & { model: string }): Promise<AIResponse> {
    const key = this.cfg.apiKey();
    const base = this.cfg.baseUrl();
    if (!key || !base) throw new AIError("not_configured", "api key missing", this.id);
    const res = await timedFetch(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: req.model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          temperature: req.temperature ?? 0.5,
          max_tokens: req.maxOutputTokens ?? 4096,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
          ...(this.cfg.extraBody?.(req.model) ?? {}),
        }),
      },
      req.timeoutMs ?? 50_000,
      this.id,
    );
    if (!res.ok) throw await httpError(res, this.id);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new AIError("bad_response", "empty response", this.id);
    return { text, provider: this.id, model: req.model, usage: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens } };
  }

  get transcribe() {
    const modelFn = this.cfg.transcriptionModel;
    if (!modelFn) return undefined;
    return async (audio: Blob, opts: { language?: string; filename?: string }) => {
      const key = this.cfg.apiKey();
      const base = this.cfg.baseUrl();
      const model = modelFn();
      if (!key || !base || !model) throw new AIError("not_configured", "transcription not configured", this.id);
      const form = new FormData();
      form.append("file", audio, opts.filename ?? "voice.webm");
      form.append("model", model);
      if (opts.language) form.append("language", opts.language);
      form.append("response_format", "json");
      form.append("temperature", "0");
      const res = await timedFetch(`${base}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form }, 45_000, this.id);
      if (!res.ok) throw await httpError(res, this.id);
      const data = (await res.json()) as { text?: string };
      return { text: (data.text ?? "").trim(), model };
    };
  }
}

export const groqProvider = () =>
  new OpenAICompatibleProvider({
    id: "groq",
    label: "Groq",
    baseUrl: () => "https://api.groq.com/openai/v1",
    apiKey: () => env().GROQ_API_KEY,
    model: (s) => (s === "large" ? env().GROQ_MODEL_LARGE : env().GROQ_MODEL_SMALL),
    // gpt-oss models reason before answering; "low" keeps latency and the 8K tokens/min budget in check.
    extraBody: (model) => (model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    transcriptionModel: () => env().GROQ_MODEL_TRANSCRIBE,
  });

export const mistralProvider = () =>
  new OpenAICompatibleProvider({
    id: "mistral",
    label: "Mistral",
    baseUrl: () => "https://api.mistral.ai/v1",
    apiKey: () => env().MISTRAL_API_KEY,
    model: (s) => (s === "large" ? env().MISTRAL_MODEL_LARGE : env().MISTRAL_MODEL_SMALL),
  });

export const extraProvider = () =>
  new OpenAICompatibleProvider({
    id: "extra",
    label: env().EXTRA_AI_LABEL,
    baseUrl: () => env().EXTRA_AI_BASE_URL?.replace(/\/+$/, ""),
    apiKey: () => env().EXTRA_AI_API_KEY,
    model: () => env().EXTRA_AI_MODEL,
  });
