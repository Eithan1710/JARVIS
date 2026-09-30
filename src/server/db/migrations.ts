/**
 * SQL migrations, embedded in code so they ship inside the serverless bundle and run
 * automatically on first connection (guarded by an advisory lock). Append new entries;
 * never edit an applied one. Keep in sync with ./schema.ts.
 */
export interface Migration {
  name: string;
  sql: string;
}

const init = /* sql */ `
CREATE TABLE jarvis.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  locale text NOT NULL DEFAULT 'he',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jarvis.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX conversations_user_recent_idx ON jarvis.conversations (user_id, last_message_at);

CREATE TABLE jarvis.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES jarvis.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  input_mode text NOT NULL DEFAULT 'text',
  kind text NOT NULL DEFAULT 'chat',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON jarvis.messages (conversation_id, created_at);
CREATE INDEX messages_user_idx ON jarvis.messages (user_id, created_at);

CREATE TABLE jarvis.prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  conversation_id uuid,
  message_id uuid,
  purpose text NOT NULL,
  provider text,
  model text,
  system text NOT NULL DEFAULT '',
  input jsonb NOT NULL DEFAULT '[]'::jsonb,
  output text,
  status text NOT NULL,
  error text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prompts_user_idx ON jarvis.prompts (user_id, created_at);

CREATE TABLE jarvis.tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  conversation_id uuid,
  message_id uuid,
  tool text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  status text NOT NULL,
  error text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tool_calls_user_idx ON jarvis.tool_calls (user_id, created_at);

CREATE TABLE jarvis.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  role_prompt text NOT NULL,
  role_hash text NOT NULL,
  uses integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workers_user_hash_idx ON jarvis.workers (user_id, role_hash);

CREATE TABLE jarvis.worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES jarvis.workers(id) ON DELETE CASCADE,
  conversation_id uuid,
  message_id uuid,
  task text NOT NULL,
  input text NOT NULL DEFAULT '',
  output text,
  provider text,
  model text,
  status text NOT NULL,
  error text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX worker_runs_user_idx ON jarvis.worker_runs (user_id, created_at);

CREATE TABLE jarvis.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'fact',
  content text NOT NULL,
  importance smallint NOT NULL DEFAULT 3,
  source text NOT NULL DEFAULT 'extracted',
  status text NOT NULL DEFAULT 'active',
  source_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX memories_user_idx ON jarvis.memories (user_id, status);

CREATE TABLE jarvis.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  metric jsonb,
  due_date date,
  status text NOT NULL DEFAULT 'active',
  check_in_every_days integer NOT NULL DEFAULT 7,
  next_check_in_at timestamptz,
  progress jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goals_user_idx ON jarvis.goals (user_id, status);

CREATE TABLE jarvis.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  reminder_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX habits_user_idx ON jarvis.habits (user_id, status);

CREATE TABLE jarvis.habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES jarvis.habits(id) ON DELETE CASCADE,
  day date NOT NULL,
  status text NOT NULL DEFAULT 'done',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX habit_logs_habit_day_idx ON jarvis.habit_logs (habit_id, day);

CREATE TABLE jarvis.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  conversation_id uuid,
  text text NOT NULL,
  due_at timestamptz NOT NULL,
  recurrence jsonb,
  kind text NOT NULL DEFAULT 'reminder',
  ref_id uuid,
  status text NOT NULL DEFAULT 'scheduled',
  last_fired_at timestamptz,
  fire_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminders_due_idx ON jarvis.reminders (status, due_at);
CREATE INDEX reminders_user_idx ON jarvis.reminders (user_id, status);

CREATE TABLE jarvis.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  priority smallint NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX tasks_user_idx ON jarvis.tasks (user_id, status);

CREATE TABLE jarvis.ai_providers (
  id text PRIMARY KEY,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  cooldown_until timestamptz,
  last_error text,
  last_ok_at timestamptz,
  day date,
  requests_today integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jarvis.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_enc text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX connections_user_type_name_idx ON jarvis.connections (user_id, type, name);

CREATE TABLE jarvis.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES jarvis.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  failure_count integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jarvis.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  run_key text NOT NULL UNIQUE,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  detail jsonb,
  error text
);
`;

/**
 * Defense in depth: the app connects as the schema owner (bypasses RLS). With RLS enabled and
 * no policies, other roles (e.g. Supabase anon/authenticated via the public REST API) see nothing.
 */
const lockdown = /* sql */ `
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'jarvis' LOOP
    EXECUTE format('ALTER TABLE jarvis.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
`;

export const migrations: Migration[] = [
  { name: "0001_init", sql: init },
  { name: "0002_rls", sql: lockdown },
];
