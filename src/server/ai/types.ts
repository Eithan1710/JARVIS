/** Size class of a model inside one provider. */
export type ModelSize = "large" | "small";

/**
 * What a call is for. The router maps each role to an ordered chain of provider/model pairs,
 * so callers never pick a provider — JARVIS does.
 */
export type AIRole = "leader" | "light" | "worker_fast" | "worker_deep";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequest {
  system: string;
  messages: AIMessage[];
  /** Ask for a JSON object response. The caller still validates it. */
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  usage?: { input?: number; output?: number };
}

export type AIErrorKind = "not_configured" | "rate_limit" | "auth" | "unavailable" | "timeout" | "blocked" | "bad_response";

export class AIError extends Error {
  constructor(
    public kind: AIErrorKind,
    message: string,
    public provider?: string,
  ) {
    super(message);
    this.name = "AIError";
  }
  /** Whether trying the next provider makes sense. */
  get retryable() {
    return this.kind !== "blocked";
  }
}

export interface AIProvider {
  id: string;
  label: string;
  available(): boolean;
  model(size: ModelSize): string;
  generate(req: AIRequest & { model: string }): Promise<AIResponse>;
  /** Speech-to-text, when the provider supports it. */
  transcribe?(audio: Blob, opts: { language?: string; filename?: string }): Promise<{ text: string; model: string }>;
}
