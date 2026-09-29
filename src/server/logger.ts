import "server-only";

/**
 * Minimal structured logger.
 *
 * Privacy rule: never pass personal content (journal text, notes, AI prompts/answers,
 * metric values) to the logger. Log identifiers, counts, durations and error codes only.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || "info";
  return order[lvl] ?? 20;
}

const REDACT_KEYS = /(token|secret|password|passcode|authorization|cookie|key|body|content|note|text|prompt)/i;

function redact(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = REDACT_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

function write(level: Level, scope: string, msg: string, meta?: Record<string, unknown>) {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...redact(meta) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logger(scope: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => write("debug", scope, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => write("info", scope, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => write("warn", scope, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => write("error", scope, msg, meta),
  };
}

export function errorInfo(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { error: err.name, errorMessage: err.message.slice(0, 300) };
  return { error: String(err).slice(0, 300) };
}
