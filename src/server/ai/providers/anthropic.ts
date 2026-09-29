import "server-only";
import { env } from "../../env";
import { AIError, type AIProvider, type AIRequest, type AIResponse, type ModelTier } from "../types";
import { timedFetch } from "./gemini";

/** Anthropic Claude (paid; optional). */
export class AnthropicProvider implements AIProvider {
  id = "anthropic";
  label = "Anthropic Claude";
  privacyNote = "Anthropic לא משתמשת בנתוני API לאימון מודלים כברירת מחדל.";

  available() {
    return Boolean(env().ANTHROPIC_API_KEY);
  }

  modelFor(tier: ModelTier) {
    return tier === "fast" ? env().ANTHROPIC_MODEL_FAST : env().ANTHROPIC_MODEL_DEEP;
  }

  async generate(req: AIRequest): Promise<AIResponse> {
    const key = env().ANTHROPIC_API_KEY;
    if (!key) throw new AIError("not_configured", "ANTHROPIC_API_KEY missing", this.id);
    const model = this.modelFor(req.tier);
    const res = await timedFetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          system: req.json ? `${req.system}\n\nRespond with a single JSON object only.` : req.system,
          messages: req.messages,
          max_tokens: req.maxOutputTokens ?? 4096,
          temperature: req.temperature ?? 0.4,
        }),
      },
      req.timeoutMs ?? 55_000,
      this.id,
    );
    if (!res.ok) {
      if (res.status === 429 || res.status === 529) throw new AIError("rate_limit", "rate limited", this.id);
      if (res.status === 401 || res.status === 403) throw new AIError("auth", "auth failed", this.id);
      if (res.status >= 500) throw new AIError("unavailable", `server error ${res.status}`, this.id);
      throw new AIError("bad_response", `http ${res.status}`, this.id);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (!text) throw new AIError("bad_response", "empty response", this.id);
    return { text, provider: this.id, model, usage: { input: data.usage?.input_tokens, output: data.usage?.output_tokens } };
  }
}
