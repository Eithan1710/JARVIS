import "server-only";
import type { ZodType } from "zod";
import type { Chip, ClientAction, IconName } from "@/lib/protocol";
import type { UserContext } from "../context";

export interface ToolContext {
  ctx: UserContext;
  conversationId: string;
  /** The user message this turn answers (history links everything to it). */
  messageId: string;
}

export interface ToolResult {
  ok: boolean;
  /** Observation returned to the Leader (keep it compact — it goes back into the prompt). */
  data?: unknown;
  /** Error text for the Leader when ok = false. */
  error?: string;
  /** Something the browser should offer to open. */
  action?: ClientAction;
  /** Confirmation chip shown under the reply. */
  chip?: Chip;
}

/**
 * A capability the Leader can use. Adding a tool = one object in the registry; the Leader sees
 * its name, description and signature in its system prompt and decides when to call it.
 */
export interface ToolDefinition<A = Record<string, unknown>> {
  name: string;
  /** English, for the Leader. Say when to use it. */
  description: string;
  /** Compact argument signature shown to the Leader, e.g. `{ query: string, limit?: number }`. */
  signature: string;
  params: ZodType<A>;
  /** Subtle Hebrew status line while it runs ("יוצר תזכורת…"). */
  status: (args: A) => string;
  icon: IconName;
  /** Hide the tool when a connection/key it needs is missing. */
  available?: (ctx: UserContext) => boolean;
  run(args: A, t: ToolContext): Promise<ToolResult>;
}

/** Helper that keeps each tool's argument type inferred from its zod schema. */
export function defineTool<A>(def: ToolDefinition<A>): ToolDefinition<A> {
  return def;
}
