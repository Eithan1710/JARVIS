CREATE SCHEMA IF NOT EXISTS "nova";
--> statement-breakpoint
CREATE TABLE "nova"."ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'שיחה חדשה' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"structured" jsonb,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."ai_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"provider" text,
	"model" text,
	"tier" text,
	"data_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_chars" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"kind" text DEFAULT 'other' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"integration_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."daily_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"mood" smallint,
	"energy" smallint,
	"focus" smallint,
	"note" text,
	"highlight" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"hypothesis" text,
	"intervention" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"baseline_days" integer DEFAULT 21 NOT NULL,
	"target_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"compliance_habit_id" uuid,
	"status" text DEFAULT 'planned' NOT NULL,
	"result" jsonb,
	"ai_summary" jsonb,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."goal_habits" (
	"goal_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	CONSTRAINT "goal_habits_goal_id_habit_id_pk" PRIMARY KEY("goal_id","habit_id")
);
--> statement-breakpoint
CREATE TABLE "nova"."goal_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."goal_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"value" double precision NOT NULL,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"progress_mode" text DEFAULT 'manual' NOT NULL,
	"target_value" double precision,
	"unit" text,
	"start_value" double precision,
	"deadline" date,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"metric_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"completed_at" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."habit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"value" double precision,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"tier" text DEFAULT 'main' NOT NULL,
	"kind" text DEFAULT 'boolean' NOT NULL,
	"unit" text,
	"target_value" double precision,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"schedule_days" smallint[] DEFAULT '{0,1,2,3,4,5,6}'::smallint[] NOT NULL,
	"weekly_target" smallint,
	"preferred_time" text,
	"time_label" text,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"metric_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"archived_at" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."imported_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"integration_id" uuid,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"record_type" text NOT NULL,
	"raw" jsonb NOT NULL,
	"status" text DEFAULT 'processed' NOT NULL,
	"error" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."insight_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"data" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"evidence_level" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text,
	"period_start" date,
	"period_end" date,
	"sample_size" integer,
	"confidence" text,
	"confidence_reason" text,
	"caveats" text[] DEFAULT '{}'::text[] NOT NULL,
	"fingerprint" text NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"generated_by" text DEFAULT 'analytics' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_encrypted" text,
	"ingest_token_hash" text,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"run_key" text NOT NULL,
	"status" text NOT NULL,
	"detail" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_runs_run_key_unique" UNIQUE("run_key")
);
--> statement-breakpoint
CREATE TABLE "nova"."journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"confidence" text,
	"source" text DEFAULT 'user' NOT NULL,
	"source_ref" jsonb,
	"valid_from" date,
	"valid_to" date,
	"supersedes_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."metric_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"unit" text,
	"category" text DEFAULT 'other' NOT NULL,
	"aggregation" text DEFAULT 'sum' NOT NULL,
	"higher_is_better" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text,
	"date" date NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_record_id" uuid,
	"raw_value" jsonb,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"type" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"reason" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"habit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "nova"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"facts" jsonb NOT NULL,
	"narrative" jsonb,
	"ai_status" text DEFAULT 'skipped' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"occurred_at" timestamp with time zone,
	"amount" double precision NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"description" text,
	"merchant" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"locale" text DEFAULT 'he-IL' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nova"."ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "nova"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."ai_tasks" ADD CONSTRAINT "ai_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."calendar_events" ADD CONSTRAINT "calendar_events_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "nova"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."daily_checkins" ADD CONSTRAINT "daily_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."experiments" ADD CONSTRAINT "experiments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."experiments" ADD CONSTRAINT "experiments_compliance_habit_id_habits_id_fk" FOREIGN KEY ("compliance_habit_id") REFERENCES "nova"."habits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."goal_habits" ADD CONSTRAINT "goal_habits_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "nova"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."goal_habits" ADD CONSTRAINT "goal_habits_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "nova"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."goal_milestones" ADD CONSTRAINT "goal_milestones_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "nova"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."goal_progress" ADD CONSTRAINT "goal_progress_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "nova"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."habit_events" ADD CONSTRAINT "habit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."habit_events" ADD CONSTRAINT "habit_events_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "nova"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."imported_records" ADD CONSTRAINT "imported_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."imported_records" ADD CONSTRAINT "imported_records_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "nova"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."insight_evidence" ADD CONSTRAINT "insight_evidence_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "nova"."insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."insights" ADD CONSTRAINT "insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."metric_definitions" ADD CONSTRAINT "metric_definitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."metrics" ADD CONSTRAINT "metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."metrics" ADD CONSTRAINT "metrics_source_record_id_imported_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "nova"."imported_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."notification_events" ADD CONSTRAINT "notification_events_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "nova"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."notifications" ADD CONSTRAINT "notifications_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "nova"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nova"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova"."transactions" ADD CONSTRAINT "transactions_source_record_id_imported_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "nova"."imported_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_user_idx" ON "nova"."ai_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_messages_conv_idx" ON "nova"."ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_tasks_user_created_idx" ON "nova"."ai_tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "calendar_user_start_idx" ON "nova"."calendar_events" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_external_uq" ON "nova"."calendar_events" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkins_user_date_uq" ON "nova"."daily_checkins" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "experiments_user_idx" ON "nova"."experiments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_milestones_goal_idx" ON "nova"."goal_milestones" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_progress_goal_idx" ON "nova"."goal_progress" USING btree ("goal_id","recorded_at");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "nova"."goals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_events_habit_date_uq" ON "nova"."habit_events" USING btree ("habit_id","date");--> statement-breakpoint
CREATE INDEX "habit_events_user_date_idx" ON "nova"."habit_events" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "habits_user_idx" ON "nova"."habits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "imported_records_ext_uq" ON "nova"."imported_records" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "imported_records_user_idx" ON "nova"."imported_records" USING btree ("user_id","imported_at");--> statement-breakpoint
CREATE INDEX "insight_evidence_insight_idx" ON "nova"."insight_evidence" USING btree ("insight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insights_user_fp_uq" ON "nova"."insights" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "insights_user_created_idx" ON "nova"."insights" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "integrations_user_idx" ON "nova"."integrations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_ingest_uq" ON "nova"."integrations" USING btree ("ingest_token_hash");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "nova"."job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "journal_user_date_idx" ON "nova"."journal_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "memories_user_status_idx" ON "nova"."memories" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_definitions_user_key_uq" ON "nova"."metric_definitions" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "metrics_user_key_date_idx" ON "nova"."metrics" USING btree ("user_id","metric_key","date");--> statement-breakpoint
CREATE INDEX "metrics_user_date_idx" ON "nova"."metrics" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_source_record_uq" ON "nova"."metrics" USING btree ("source_record_id","metric_key");--> statement-breakpoint
CREATE INDEX "notification_events_n_idx" ON "nova"."notification_events" USING btree ("notification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uq" ON "nova"."notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_sched_idx" ON "nova"."notifications" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_user_kind_period_uq" ON "nova"."reports" USING btree ("user_id","kind","period_start");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "nova"."transactions" USING btree ("user_id","date");