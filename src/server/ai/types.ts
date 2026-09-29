export type ModelTier = "fast" | "balanced" | "deep";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequest {
  system: string;
  messages: AIMessage[];
  tier: ModelTier;
  /** Ask the provider for a JSON object response. The caller still validates it. */
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

export type AIErrorKind = "not_configured" | "rate_limit" | "auth" | "unavailable" | "timeout" | "blocked" | "bad_response" | "disabled";

export class AIError extends Error {
  constructor(
    public kind: AIErrorKind,
    message: string,
    public provider?: string,
  ) {
    super(message);
    this.name = "AIError";
  }
  get retryable() {
    return this.kind === "rate_limit" || this.kind === "unavailable" || this.kind === "timeout" || this.kind === "auth" || this.kind === "bad_response";
  }
}

export interface AIProvider {
  id: string;
  label: string;
  /** Whether credentials are configured. */
  available(): boolean;
  modelFor(tier: ModelTier): string;
  generate(req: AIRequest): Promise<AIResponse>;
  /** Free-tier providers may use prompts for training; surfaced in Settings. */
  privacyNote: string;
}
