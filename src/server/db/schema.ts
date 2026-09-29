/**
 * NOVA data model.
 *
 * Design principles:
 *  - Everything lives in a dedicated Postgres schema (`nova`) so the app can share a
 *    database with other projects without touching their tables.
 *  - History over state: facts are stored as dated events/records, never overwritten
 *    summaries. Derived values are recomputed from source rows.
 *  - Provenance: every data row carries `source` and, when imported, a link to the raw
 *    `imported_records` row it came from.
 *  - Single user today, multi-user ready: every top-level row carries `user_id`.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const nova = pgSchema("nova");

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const users = nova.table("users", {
  id: id(),
  displayName: text("display_name").notNull().default(""),
  timezone: text("timezone").notNull().default("Asia/Jerusalem"),
  locale: text("locale").notNull().default("he-IL"),
  /** Free-form settings validated by `src/lib/settings.ts`. */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Habits                                                              */
/* ------------------------------------------------------------------ */

export const habits = nova.table(
  "habits",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    color: text("color"),
    /** "main" = planned activity, "side" = supporting daily habit. */
    tier: text("tier").$type<"main" | "side">().notNull().default("main"),
    /** boolean = done/not done, quantity = numeric value against a target. */
    kind: text("kind").$type<"boolean" | "quantity">().notNull().default("boolean"),
    unit: text("unit"),
    targetValue: doublePrecision("target_value"),
    /** daily | specific_days (scheduleDays) | weekly_count (N times per week, any day) */
    frequency: text("frequency").$type<"daily" | "specific_days" | "weekly_count">().notNull().default("daily"),
    /** 0=Sunday … 6=Saturday */
    scheduleDays: smallint("schedule_days").array().notNull().default(sql`'{0,1,2,3,4,5,6}'::smallint[]`),
    weeklyTarget: smallint("weekly_target"),
    /** HH:MM local time the habit usually happens. */
    preferredTime: text("preferred_time"),
    /** Human label shown next to the habit, e.g. "18:00–19:30". */
    timeLabel: text("time_label"),
    reminderEnabled: boolean("reminder_enabled").notNull().default(false),
    /** Links the habit to a metric key so imported data can auto-complete it. */
    metricKey: text("metric_key"),
    sortOrder: integer("sort_order").notNull().default(0),
    startDate: date("start_date"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("habits_user_idx").on(t.userId)],
);

export type HabitStatus = "completed" | "partial" | "missed" | "skipped";

/** One row per habit per local date. The row is the day's outcome; the table is the history. */
export const habitEvents = nova.table(
  "habit_events",
  {
    id: id(),
    userId: userRef(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: text("status").$type<HabitStatus>().notNull(),
    value: doublePrecision("value"),
    note: text("note"),
    /** When it actually happened (used to learn typical times). */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** manual | system (auto "missed") | integration id | demo */
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("habit_events_habit_date_uq").on(t.habitId, t.date),
    index("habit_events_user_date_idx").on(t.userId, t.date),
  ],
);

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

export const goals = nova.table(
  "goals",
  {
    id: id(),
    userId: userRef(),
    title: text("title").notNull(),
    description: text("description"),
    /** manual (progress entries) | milestones | habits (derived from linked habit consistency) */
    progressMode: text("progress_mode").$type<"manual" | "milestones" | "habits">().notNull().default("manual"),
    targetValue: doublePrecision("target_value"),
    unit: text("unit"),
    startValue: doublePrecision("start_value"),
    deadline: date("deadline"),
    status: text("status").$type<"active" | "completed" | "paused" | "abandoned">().notNull().default("active"),
    notes: text("notes"),
    /** Metric keys that are relevant context for this goal (e.g. weight, study_minutes). */
    metricKeys: text("metric_keys").array().notNull().default(sql`'{}'::text[]`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

export const goalMilestones = nova.table(
  "goal_milestones",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("goal_milestones_goal_idx").on(t.goalId)],
);

export const goalHabits = nova.table(
  "goal_habits",
  {
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.habitId] })],
);

/** Append-only history of progress updates for a goal. */
export const goalProgress = nova.table(
  "goal_progress",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    value: doublePrecision("value").notNull(),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("goal_progress_goal_idx").on(t.goalId, t.recordedAt)],
);

/* ------------------------------------------------------------------ */
/* Check-ins & journal                                                 */
/* ------------------------------------------------------------------ */

export const dailyCheckins = nova.table(
  "daily_checkins",
  {
    id: id(),
    userId: userRef(),
    date: date("date").notNull(),
    mood: smallint("mood"),
    energy: smallint("energy"),
    focus: smallint("focus"),
    note: text("note"),
    highlight: text("highlight"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("daily_checkins_user_date_uq").on(t.userId, t.date)],
);

export const journalEntries = nova.table(
  "journal_entries",
  {
    id: id(),
    userId: userRef(),
    date: date("date").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title"),
    body: text("body").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Marks entries describing an important life event. */
    important: boolean("important").notNull().default(false),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("journal_user_date_idx").on(t.userId, t.date)],
);

/* ------------------------------------------------------------------ */
/* Raw imports (provenance)                                            */
/* ------------------------------------------------------------------ */

export const integrations = nova.table(
  "integrations",
  {
    id: id(),
    userId: userRef(),
    provider: text("provider").notNull(),
    status: text("status").$type<"active" | "paused" | "error">().notNull().default("active"),
    /** Non-secret configuration (e.g. latitude/longitude, username). */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** AES-GCM encrypted JSON with secrets (tokens, private URLs). */
    secretsEncrypted: text("secrets_encrypted"),
    /** SHA-256 of the ingest token for webhook-style integrations. */
    ingestTokenHash: text("ingest_token_hash"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("integrations_user_idx").on(t.userId), uniqueIndex("integrations_ingest_uq").on(t.ingestTokenHash)],
);

export const importedRecords = nova.table(
  "imported_records",
  {
    id: id(),
    userId: userRef(),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    recordType: text("record_type").notNull(),
    raw: jsonb("raw").notNull(),
    status: text("status").$type<"processed" | "failed" | "ignored">().notNull().default("processed"),
    error: text("error"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("imported_records_ext_uq").on(t.userId, t.provider, t.externalId),
    index("imported_records_user_idx").on(t.userId, t.importedAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Measurements                                                        */
/* ------------------------------------------------------------------ */

/**
 * Generic time series. One row per observation (a night of sleep, a workout, a day of
 * steps). `date` is the local date the observation belongs to.
 */
export const metrics = nova.table(
  "metrics",
  {
    id: id(),
    userId: userRef(),
    metricKey: text("metric_key").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit"),
    date: date("date").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    note: text("note"),
    source: text("source").notNull().default("manual"),
    sourceRecordId: uuid("source_record_id").references(() => importedRecords.id, { onDelete: "set null" }),
    /** Raw value as originally provided, when it differs from `value` (e.g. seconds → hours). */
    rawValue: jsonb("raw_value"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("metrics_user_key_date_idx").on(t.userId, t.metricKey, t.date),
    index("metrics_user_date_idx").on(t.userId, t.date),
    uniqueIndex("metrics_source_record_uq").on(t.sourceRecordId, t.metricKey),
  ],
);

/** User-defined metrics (built-in ones live in code: src/lib/metrics.ts). */
export const metricDefinitions = nova.table(
  "metric_definitions",
  {
    id: id(),
    userId: userRef(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    unit: text("unit"),
    category: text("category").notNull().default("other"),
    aggregation: text("aggregation").$type<"sum" | "avg" | "last" | "max">().notNull().default("sum"),
    higherIsBetter: boolean("higher_is_better"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("metric_definitions_user_key_uq").on(t.userId, t.key)],
);

export const transactions = nova.table(
  "transactions",
  {
    id: id(),
    userId: userRef(),
    date: date("date").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull().default("ILS"),
    category: text("category").notNull().default("other"),
    description: text("description"),
    merchant: text("merchant"),
    source: text("source").notNull().default("manual"),
    sourceRecordId: uuid("source_record_id").references(() => importedRecords.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("transactions_user_date_idx").on(t.userId, t.date)],
);

export const calendarEvents = nova.table(
  "calendar_events",
  {
    id: id(),
    userId: userRef(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    /** meeting | personal | focus | other */
    kind: text("kind").notNull().default("other"),
    source: text("source").notNull().default("manual"),
    externalId: text("external_id"),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("calendar_user_start_idx").on(t.userId, t.startAt),
    uniqueIndex("calendar_external_uq").on(t.userId, t.source, t.externalId),
  ],
);

/* ------------------------------------------------------------------ */
/* Memory                                                              */
/* ------------------------------------------------------------------ */

export type MemoryKind = "fact" | "preference" | "goal" | "event" | "pattern";
export type MemoryStatus = "active" | "proposed" | "rejected" | "archived";

export const memories = nova.table(
  "memories",
  {
    id: id(),
    userId: userRef(),
    kind: text("kind").$type<MemoryKind>().notNull(),
    content: text("content").notNull(),
    /** AI-proposed memories start as "proposed" and never become active without the user. */
    status: text("status").$type<MemoryStatus>().notNull().default("active"),
    confidence: text("confidence").$type<"high" | "medium" | "low">(),
    /** user | ai_conversation | insight | system | import */
    source: text("source").notNull().default("user"),
    sourceRef: jsonb("source_ref").$type<Record<string, unknown>>(),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    supersedesId: uuid("supersedes_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("memories_user_status_idx").on(t.userId, t.status)],
);

/* ------------------------------------------------------------------ */
/* Insights & reports                                                  */
/* ------------------------------------------------------------------ */

export type EvidenceLevel = "observation" | "correlation" | "temporal_association" | "hypothesis" | "stronger_evidence";
export type Confidence = "high" | "medium" | "low";

export const insights = nova.table(
  "insights",
  {
    id: id(),
    userId: userRef(),
    /** correlation | trend | change | streak | pattern | anomaly | hypothesis */
    kind: text("kind").notNull(),
    evidenceLevel: text("evidence_level").$type<EvidenceLevel>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    sampleSize: integer("sample_size"),
    confidence: text("confidence").$type<Confidence>(),
    confidenceReason: text("confidence_reason"),
    caveats: text("caveats").array().notNull().default(sql`'{}'::text[]`),
    /** Machine-readable subject for dedupe, e.g. "cond:sleep_hours>=7→habit_rate". */
    fingerprint: text("fingerprint").notNull(),
    score: doublePrecision("score").notNull().default(0),
    status: text("status").$type<"new" | "seen" | "pinned" | "dismissed" | "expired">().notNull().default("new"),
    generatedBy: text("generated_by").$type<"analytics" | "ai">().notNull().default("analytics"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("insights_user_fp_uq").on(t.userId, t.fingerprint),
    index("insights_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const insightEvidence = nova.table(
  "insight_evidence",
  {
    id: id(),
    insightId: uuid("insight_id")
      .notNull()
      .references(() => insights.id, { onDelete: "cascade" }),
    /** comparison | series | stat | table | note */
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    data: jsonb("data").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("insight_evidence_insight_idx").on(t.insightId)],
);

/** Daily briefs and weekly reviews: deterministic facts + AI narrative, one per period. */
export const reports = nova.table(
  "reports",
  {
    id: id(),
    userId: userRef(),
    kind: text("kind").$type<"daily_brief" | "weekly_review">().notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    facts: jsonb("facts").$type<Record<string, unknown>>().notNull(),
    narrative: jsonb("narrative").$type<Record<string, unknown>>(),
    aiStatus: text("ai_status").$type<"ok" | "unavailable" | "failed" | "skipped">().notNull().default("skipped"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("reports_user_kind_period_uq").on(t.userId, t.kind, t.periodStart)],
);

/* ------------------------------------------------------------------ */
/* Experiments                                                         */
/* ------------------------------------------------------------------ */

export const experiments = nova.table(
  "experiments",
  {
    id: id(),
    userId: userRef(),
    title: text("title").notNull(),
    hypothesis: text("hypothesis"),
    intervention: text("intervention"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    baselineDays: integer("baseline_days").notNull().default(21),
    /** Keys from the day-frame (e.g. sleep_hours, mood, habit:<id>). */
    targetKeys: text("target_keys").array().notNull().default(sql`'{}'::text[]`),
    complianceHabitId: uuid("compliance_habit_id").references(() => habits.id, { onDelete: "set null" }),
    status: text("status").$type<"planned" | "active" | "completed" | "cancelled">().notNull().default("planned"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    aiSummary: jsonb("ai_summary").$type<Record<string, unknown>>(),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("experiments_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export const notifications = nova.table(
  "notifications",
  {
    id: id(),
    userId: userRef(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    status: text("status").$type<"pending" | "sent" | "skipped" | "failed" | "cancelled">().notNull().default("pending"),
    /** Prevents duplicates: e.g. "habit:<id>:2026-09-29". */
    dedupeKey: text("dedupe_key").notNull(),
    /** Why the engine decided on this notification and time (shown to the user). */
    reason: jsonb("reason").$type<Record<string, unknown>>().notNull().default({}),
    habitId: uuid("habit_id").references(() => habits.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_user_dedupe_uq").on(t.userId, t.dedupeKey),
    index("notifications_user_sched_idx").on(t.userId, t.scheduledFor),
  ],
);

export const notificationEvents = nova.table(
  "notification_events",
  {
    id: id(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    /** delivered | failed | clicked | dismissed | acted */
    type: text("type").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notification_events_n_idx").on(t.notificationId)],
);

export const pushSubscriptions = nova.table("push_subscriptions", {
  id: id(),
  userId: userRef(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  failureCount: integer("failure_count").notNull().default(0),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

export const aiConversations = nova.table(
  "ai_conversations",
  {
    id: id(),
    userId: userRef(),
    title: text("title").notNull().default("שיחה חדשה"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_conversations_user_idx").on(t.userId, t.updatedAt)],
);

export const aiMessages = nova.table(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    /** Structured answer (claims, evidence, caveats, plan) for assistant messages. */
    structured: jsonb("structured").$type<Record<string, unknown>>(),
    taskId: uuid("task_id"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_conv_idx").on(t.conversationId, t.createdAt)],
);

/** Audit log of every external AI call: what kind of data left the system, and why. */
export const aiTasks = nova.table(
  "ai_tasks",
  {
    id: id(),
    userId: userRef(),
    type: text("type").notNull(),
    status: text("status").$type<"ok" | "failed" | "fallback">().notNull(),
    provider: text("provider"),
    model: text("model"),
    tier: text("tier"),
    /** Data categories and record counts included in the context (never the content itself). */
    dataScope: jsonb("data_scope").$type<Record<string, unknown>>().notNull().default({}),
    contextChars: integer("context_chars"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_tasks_user_created_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

export const jobRuns = nova.table(
  "job_runs",
  {
    id: id(),
    job: text("job").notNull(),
    /** Idempotency key, e.g. "daily_brief:2026-09-29". */
    runKey: text("run_key").notNull().unique(),
    status: text("status").$type<"running" | "ok" | "failed">().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("job_runs_job_idx").on(t.job, t.startedAt)],
);
