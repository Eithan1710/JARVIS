import "server-only";
import { z } from "zod";

/**
 * Server environment. Parsed lazily so that importing a module never crashes a build
 * step that doesn't need a given variable.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Postgres connection string. When absent, an embedded PGlite database is used (local dev only). */
  DATABASE_URL: z.string().optional(),
  /** Where the embedded dev database lives. */
  PGLITE_DIR: z.string().default(".data/pglite"),

  /** Passcode that unlocks the app. Required in production. */
  APP_PASSCODE: z.string().optional(),
  /** Secret used to sign session cookies and derive the encryption key when ENCRYPTION_KEY is absent. */
  SESSION_SECRET: z.string().optional(),
  /** 32-byte key (base64 or hex) for encrypting integration secrets. */
  ENCRYPTION_KEY: z.string().optional(),
  /** Bearer token that protects /api/cron/* endpoints. */
  CRON_SECRET: z.string().optional(),

  /** AI providers (all optional — the app degrades gracefully without them). */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_FAST: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_MODEL_BALANCED: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_DEEP: z.string().default("gemini-3.8-flash"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL_FAST: z.string().default("openai/gpt-oss-20b"),
  GROQ_MODEL_DEEP: z.string().default("openai/gpt-oss-120b"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openrouter/auto"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_FAST: z.string().default("claude-haiku-4-5"),
  ANTHROPIC_MODEL_DEEP: z.string().default("claude-sonnet-5-5"),
  /** Comma-separated provider order, e.g. "gemini,groq". */
  AI_PROVIDER_ORDER: z.string().default("gemini,groq,openrouter,anthropic"),

  /** Web push (generate with `npm run vapid`). */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:nova@example.com"),

  APP_URL: z.string().optional(),
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

export const isProd = () => env().NODE_ENV === "production";
