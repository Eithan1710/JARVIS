import "server-only";
import { z } from "zod";

/**
 * Server environment. Parsed lazily so importing a module never crashes a build step
 * that doesn't need a given variable. Every secret lives here and only here — nothing
 * in this file is ever sent to the browser.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Postgres connection string (Supabase transaction pooler). Absent → embedded PGlite (dev/test only). */
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default(".data/pglite"),

  /** Access — open by default; set REQUIRE_PASSCODE=true to require APP_PASSCODE. */
  REQUIRE_PASSCODE: z.string().optional(),
  APP_PASSCODE: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  /** Default timezone for new users (the browser's timezone overrides it on first use). */
  DEFAULT_TIMEZONE: z.string().default("Asia/Jerusalem"),

  /** AI providers — all free tiers. Any subset works; the router fails over between them. */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_LEADER: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_LIGHT: z.string().default("gemini-3.5-flash-lite"),

  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL_LARGE: z.string().default("openai/gpt-oss-120b"),
  GROQ_MODEL_SMALL: z.string().default("openai/gpt-oss-20b"),
  GROQ_MODEL_TRANSCRIBE: z.string().default("whisper-large-v3-turbo"),

  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_MODEL_LARGE: z.string().default("mistral-large-latest"),
  MISTRAL_MODEL_SMALL: z.string().default("mistral-small-latest"),

  /** Optional extra OpenAI-compatible provider (e.g. Cloudflare Workers AI, OpenRouter). */
  EXTRA_AI_BASE_URL: z.string().optional(),
  EXTRA_AI_API_KEY: z.string().optional(),
  EXTRA_AI_MODEL: z.string().optional(),
  EXTRA_AI_LABEL: z.string().default("Extra"),

  /** Tools / connections (optional). */
  TAVILY_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),

  /** Web push (generate with `npm run vapid`). */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:jarvis@example.com"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook. */
export function resetEnvCache() {
  cached = null;
}

export const isProd = () => env().NODE_ENV === "production";
