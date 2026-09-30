/**
 * JARVIS data model (Postgres schema `jarvis`).
 *
 *  - History is append-only: messages, prompts, tool_calls and worker_runs record everything
 *    JARVIS did, so the user can search it later. Nothing is silently discarded.
 *  - Long-term memory (`memories`) is separate from history: a small, curated set of facts.
 *  - Every user-owned row carries `user_id` → per-user isolation is a WHERE clause away,
 *    and every service receives a UserContext rather than reaching for "the user".
 *
 * The SQL that creates these tables lives in ./migrations.ts and must be kept in sync.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { RecurrenceRule } from "@/lib/recurrence";

export const jarvis = pgSchema("jarvis");

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/* ─────────────────────────────── identity ─────────────────────────────── */

export const users = jarvis.table("users", {
  id: id(),
  displayName: text("display_name").notNull().default(""),
  timezone: text("timezone").notNull().default("Asia/Jerusalem"),
  locale: text("locale").notNull().default("he"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ─────────────────────────────── history ──────────────────────────────── */

export const conversations = jarvis.table(
  "conversations",
  {
    id: id(),
    userId: userRef(),
    title: text("title"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("conversations_user_recent_idx").on(t.userId, t.lastMessageAt)],
);

export type MessageRole = "user" | "assistant";
export type MessageKind = "chat" | "reminder" | "habit" | "goal_checkin" | "notice";

export const messages = jarvis.table(
  "messages",
  {
    id: id(),
    userId: userRef(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").$type<MessageRole>().notNull(),
    content: text("content").notNull(),
    inputMode: text("input_mode").$type<"text" | "voice" | "system">().notNull().default("text"),
    kind: text("kind").$type<MessageKind>().notNull().default("chat"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt), index("messages_user_idx").on(t.userId, t.createdAt)],
);

/** Every model call: leader steps, workers, memory extraction, titles, transcription. */
export const prompts = jarvis.table(
  "prompts",
  {
    id: id(),
    userId: userRef(),
    conversationId: uuid("conversation_id"),
    messageId: uuid("message_id"),
    purpose: text("purpose").notNull(),
    provider: text("provider"),
    model: text("model"),
    system: text("system").notNull().default(""),
    input: jsonb("input").$type<unknown>().notNull().default([]),
    output: text("output"),
    status: text("status").$type<"ok" | "error">().notNull(),
    error: text("error"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("prompts_user_idx").on(t.userId, t.createdAt)],
);

export const toolCalls = jarvis.table(
  "tool_calls",
  {
    id: id(),
    userId: userRef(),
    conversationId: uuid("conversation_id"),
    messageId: uuid("message_id"),
    tool: text("tool").notNull(),
    args: jsonb("args").$type<unknown>().notNull().default({}),
    result: jsonb("result").$type<unknown>(),
    status: text("status").$type<"ok" | "error">().notNull(),
    error: text("error"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("tool_calls_user_idx").on(t.userId, t.createdAt)],
);

/** A worker "skill": a role prompt the Leader wrote. Deduplicated so recurring skills accumulate. */
export const workers = jarvis.table(
  "workers",
  {
    id: id(),
    userId: userRef(),
    title: text("title").notNull(),
    rolePrompt: text("role_prompt").notNull(),
    roleHash: text("role_hash").notNull(),
    uses: integer("uses").notNull().default(1),
    lastUsedAt: ts("last_used_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("workers_user_hash_idx").on(t.userId, t.roleHash)],
);

export const workerRuns = jarvis.table(
  "worker_runs",
  {
    id: id(),
    userId: userRef(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id"),
    messageId: uuid("message_id"),
    task: text("task").notNull(),
    input: text("input").notNull().default(""),
    output: text("output"),
    provider: text("provider"),
    model: text("model"),
    status: text("status").$type<"ok" | "error">().notNull(),
    error: text("error"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("worker_runs_user_idx").on(t.userId, t.createdAt)],
);

/* ─────────────────────────────── memory ───────────────────────────────── */

export type MemoryKind = "preference" | "fact" | "project" | "person" | "instruction" | "routine" | "other";

export const memories = jarvis.table(
  "memories",
  {
    id: id(),
    userId: userRef(),
    kind: text("kind").$type<MemoryKind>().notNull().default("fact"),
    content: text("content").notNull(),
    importance: smallint("importance").notNull().default(3),
    source: text("source").$type<"explicit" | "extracted">().notNull().default("extracted"),
    status: text("status").$type<"active" | "archived">().notNull().default("active"),
    sourceMessageId: uuid("source_message_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [index("memories_user_idx").on(t.userId, t.status)],
);

/* ─────────────────────────── life: goals, habits ──────────────────────── */

export interface GoalMetric {
  unit?: string;
  start?: number;
  target?: number;
  current?: number;
}
export interface GoalProgressEntry {
  at: string;
  value?: number;
  note?: string;
}

export const goals = jarvis.table(
  "goals",
  {
    id: id(),
    userId: userRef(),
    title: text("title").notNull(),
    description: text("description"),
    metric: jsonb("metric").$type<GoalMetric>(),
    dueDate: date("due_date"),
    status: text("status").$type<"active" | "done" | "abandoned">().notNull().default("active"),
    checkInEveryDays: integer("check_in_every_days").notNull().default(7),
    nextCheckInAt: ts("next_check_in_at"),
    progress: jsonb("progress").$type<GoalProgressEntry[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId, t.status)],
);

export interface HabitSchedule {
  /** 0 = Sunday … 6 = Saturday. Empty/absent = every day. */
  days?: number[];
  /** Local "HH:MM" to remind at, or null for no reminder. */
  time?: string | null;
}

export const habits = jarvis.table(
  "habits",
  {
    id: id(),
    userId: userRef(),
    title: text("title").notNull(),
    description: text("description"),
    schedule: jsonb("schedule").$type<HabitSchedule>().notNull().default({}),
    status: text("status").$type<"active" | "paused" | "archived">().notNull().default("active"),
    reminderId: uuid("reminder_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("habits_user_idx").on(t.userId, t.status)],
);

export const habitLogs = jarvis.table(
  "habit_logs",
  {
    id: id(),
    userId: userRef(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    status: text("status").$type<"done" | "skipped">().notNull().default("done"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("habit_logs_habit_day_idx").on(t.habitId, t.day)],
);

/* ─────────────────────────── reminders & tasks ────────────────────────── */

export type Recurrence = RecurrenceRule;

export const reminders = jarvis.table(
  "reminders",
  {
    id: id(),
    userId: userRef(),
    conversationId: uuid("conversation_id"),
    text: text("text").notNull(),
    dueAt: ts("due_at").notNull(),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    kind: text("kind").$type<"reminder" | "habit">().notNull().default("reminder"),
    refId: uuid("ref_id"),
    status: text("status").$type<"scheduled" | "sending" | "done" | "cancelled">().notNull().default("scheduled"),
    lastFiredAt: ts("last_fired_at"),
    fireCount: integer("fire_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("reminders_due_idx").on(t.status, t.dueAt), index("reminders_user_idx").on(t.userId, t.status)],
);

export const tasks = jarvis.table(
  "tasks",
  {
    id: id(),
    userId: userRef(),
    title: text("title").notNull(),
    notes: text("notes"),
    dueAt: ts("due_at"),
    status: text("status").$type<"open" | "done" | "cancelled">().notNull().default("open"),
    priority: smallint("priority").notNull().default(2),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("tasks_user_idx").on(t.userId, t.status)],
);

/* ─────────────────────── providers & connections ──────────────────────── */

/** Runtime state of each AI provider (shared across serverless instances). */
export const aiProviders = jarvis.table("ai_providers", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  cooldownUntil: ts("cooldown_until"),
  lastError: text("last_error"),
  lastOkAt: ts("last_ok_at"),
  day: date("day"),
  requestsToday: integer("requests_today").notNull().default(0),
  updatedAt: updatedAt(),
});

export const connections = jarvis.table(
  "connections",
  {
    id: id(),
    userId: userRef(),
    type: text("type").notNull(),
    name: text("name").notNull().default("default"),
    status: text("status").$type<"active" | "disabled" | "error">().notNull().default("active"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** AES-256-GCM encrypted JSON (tokens etc). Never returned to the client. */
    secretEnc: text("secret_enc"),
    lastUsedAt: ts("last_used_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connections_user_type_name_idx").on(t.userId, t.type, t.name)],
);

/* ─────────────────────────────── plumbing ─────────────────────────────── */

export const pushSubscriptions = jarvis.table("push_subscriptions", {
  id: id(),
  userId: userRef(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  failureCount: integer("failure_count").notNull().default(0),
  lastSuccessAt: ts("last_success_at"),
  createdAt: createdAt(),
});

export const jobRuns = jarvis.table("job_runs", {
  id: id(),
  job: text("job").notNull(),
  runKey: text("run_key").notNull().unique(),
  status: text("status").$type<"running" | "ok" | "failed">().notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  error: text("error"),
});
