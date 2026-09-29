import "server-only";
import { env } from "../../env";
import { AIError, type AIProvider, type AIRequest, type AIResponse, type ModelTier } from "../types";

async function httpError(res: Response, provider: string): Promise<AIError> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 200);
  } catch {
    /* ignore */
  }
  if (res.status === 429) return new AIError("rate_limit", `rate limited (${res.status})`, provider);
  if (res.status === 401 || res.status === 403) return new AIError("auth", `auth failed (${res.status})`, provider);
  if (res.status >= 500) return new AIError("unavailable", `server error ${res.status}`, provider);
  return new AIError("bad_response", `http ${res.status}: ${detail.replace(/\s+/g, " ")}`, provider);
}

export async function timedFetch(url: string, init: RequestInit, timeoutMs: number, provider: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AIError("timeout", "request timed out", provider);
    throw new AIError("unavailable", e instanceof Error ? e.message : "network error", provider);
  }
}

/** Google Gemini via the REST API (free tier available). */
export class GeminiProvider implements AIProvider {
  id = "gemini";
  label = "Google Gemini";
  privacyNote = "בשכבה החינמית של Gemini, Google רשאית להשתמש בתוכן הבקשות לשיפור המוצרים שלה.";

  available() {
    return Boolean(env().GEMINI_API_KEY);
  }

  modelFor(tier: ModelTier) {
    const e = env();
    return tier === "fast" ? e.GEMINI_MODEL_FAST : tier === "deep" ? e.GEMINI_MODEL_DEEP : e.GEMINI_MODEL_BALANCED;
  }

  async generate(req: AIRequest): Promise<AIResponse> {
    const key = env().GEMINI_API_KEY;
    if (!key) throw new AIError("not_configured", "GEMINI_API_KEY missing", this.id);
    const model = this.modelFor(req.tier);
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxOutputTokens ?? 4096,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    };
    const res = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) },
      req.timeoutMs ?? 55_000,
      this.id,
    );
    if (!res.ok) throw await httpError(res, this.id);
    type GeminiPart = { text?: string; thought?: boolean };
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    if (data.promptFeedback?.blockReason) throw new AIError("blocked", `blocked: ${data.promptFeedback.blockReason}`, this.id);
    const cand = data.candidates?.[0];
    if (cand?.finishReason === "SAFETY") throw new AIError("blocked", "blocked by safety filter", this.id);
    const text = (cand?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
    if (!text) throw new AIError("bad_response", `empty response (${cand?.finishReason ?? "no candidate"})`, this.id);
    return {
      text,
      provider: this.id,
      model,
      usage: { input: data.usageMetadata?.promptTokenCount, output: data.usageMetadata?.candidatesTokenCount },
    };
  }
}
