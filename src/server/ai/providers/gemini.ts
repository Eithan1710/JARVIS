import "server-only";
import { env } from "../../env";
import { AIError, type AIProvider, type AIRequest, type AIResponse, type ModelSize } from "../types";
import { httpError, timedFetch } from "./http";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart = { text?: string; thought?: boolean; inline_data?: { mime_type: string; data: string } };
type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

/** Google Gemini via the REST API (free tier: no card; prompts may be used to improve Google products). */
export class GeminiProvider implements AIProvider {
  id = "gemini";
  label = "Google Gemini";

  available() {
    return Boolean(env().GEMINI_API_KEY);
  }

  model(size: ModelSize) {
    return size === "large" ? env().GEMINI_MODEL_LEADER : env().GEMINI_MODEL_LIGHT;
  }

  private async call(model: string, body: unknown, timeoutMs: number): Promise<{ text: string; data: GeminiResponse }> {
    const key = env().GEMINI_API_KEY;
    if (!key) throw new AIError("not_configured", "GEMINI_API_KEY missing", this.id);
    const res = await timedFetch(
      `${BASE}/${encodeURIComponent(model)}:generateContent`,
      { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) },
      timeoutMs,
      this.id,
    );
    if (!res.ok) throw await httpError(res, this.id);
    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) throw new AIError("blocked", `blocked: ${data.promptFeedback.blockReason}`, this.id);
    const cand = data.candidates?.[0];
    if (cand?.finishReason === "SAFETY") throw new AIError("blocked", "blocked by safety filter", this.id);
    const text = (cand?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
    if (!text) throw new AIError("bad_response", `empty response (${cand?.finishReason ?? "no candidate"})`, this.id);
    return { text, data };
  }

  async generate(req: AIRequest & { model: string }): Promise<AIResponse> {
    const { text, data } = await this.call(
      req.model,
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: {
          temperature: req.temperature ?? 0.5,
          maxOutputTokens: req.maxOutputTokens ?? 4096,
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      },
      req.timeoutMs ?? 50_000,
    );
    return {
      text,
      provider: this.id,
      model: req.model,
      usage: { input: data.usageMetadata?.promptTokenCount, output: data.usageMetadata?.candidatesTokenCount },
    };
  }

  async transcribe(audio: Blob, opts: { language?: string }) {
    const model = this.model("small");
    const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const lang = opts.language === "he" ? "Hebrew (it may contain English words)" : "the spoken language";
    const { text } = await this.call(
      model,
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: `Transcribe this recording verbatim in ${lang}. Output only the transcript text, nothing else.` },
              { inline_data: { mime_type: (audio.type || "audio/webm").split(";")[0], data } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      },
      45_000,
    );
    return { text: text.trim(), model };
  }
}
