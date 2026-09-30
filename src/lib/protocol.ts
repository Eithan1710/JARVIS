/**
 * Wire protocol between /api/chat and the chat UI (newline-delimited JSON).
 * Shared by server and client — keep it free of server-only imports.
 */

export type IconName =
  | "spark"
  | "memory"
  | "search"
  | "history"
  | "bell"
  | "repeat"
  | "target"
  | "check"
  | "calendar"
  | "link"
  | "youtube"
  | "music"
  | "map"
  | "github"
  | "globe"
  | "worker"
  | "task";

/** Something the browser should offer to do (the server can't open apps on your device). */
export interface ClientAction {
  type: "open_url";
  url: string;
  label: string;
  icon: IconName;
}

/** A small confirmation shown under a reply, e.g. "⏰ היום ב־20:00". */
export interface Chip {
  icon: IconName;
  text: string;
}

/** One step JARVIS took — shown subtly while working, and under "פרטים" afterwards. */
export interface Step {
  id: string;
  kind: "tool" | "worker" | "think";
  label: string;
  state: "running" | "done" | "error";
  /** Technical detail for the optional details view (tool name, provider/model, ms). */
  detail?: string;
}

export type StreamEvent =
  | { type: "meta"; conversationId: string; userMessageId: string; transcript?: string }
  | { type: "step"; step: Step }
  | { type: "action"; action: ClientAction }
  | { type: "chip"; chip: Chip }
  | { type: "reply"; messageId: string; text: string; createdAt: string }
  | { type: "title"; conversationId: string; title: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** Shape of a message as the UI renders it. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: string;
  inputMode: string;
  createdAt: string;
  steps?: Step[];
  actions?: ClientAction[];
  chips?: Chip[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  lastMessageAt: string;
  preview: string | null;
}
