import "server-only";
import { sql } from "drizzle-orm";
import { generate } from "../ai/router";
import type { UserContext } from "../context";
import { sha256 } from "../crypto";
import { getDb } from "../db/client";
import { workerRuns, workers } from "../db/schema";
import { WORKER_SUFFIX } from "./prompts";

export interface WorkerSpec {
  title: string;
  role: string;
  task: string;
  context?: string;
  speed?: "fast" | "deep";
  provider?: string;
}

export interface WorkerOutcome {
  ok: boolean;
  output?: string;
  error?: string;
  provider?: string;
  model?: string;
  ms: number;
}

/** Fast workers run on small-context free tiers (Groq: 8K tokens/min), so their input is trimmed harder. */
const CONTEXT_LIMIT = { fast: 14_000, deep: 60_000 };

/**
 * A Worker is a one-off specialist: the Leader writes its role and task, JARVIS runs it on the
 * best available provider for its speed class and records both the skill (deduplicated by role)
 * and the run in history.
 */
export async function runWorker(ctx: UserContext, spec: WorkerSpec, link: { conversationId: string; messageId: string }): Promise<WorkerOutcome> {
  const started = Date.now();
  const speed = spec.speed === "fast" ? "fast" : "deep";
  const context = (spec.context ?? "").slice(0, CONTEXT_LIMIT[speed]);
  const input = context ? `${spec.task}\n\n# Context\n${context}` : spec.task;
  const db = await getDb();
  const role = spec.role.trim().slice(0, 4000);
  const [worker] = await db
    .insert(workers)
    .values({ userId: ctx.userId, title: spec.title.slice(0, 120), rolePrompt: role, roleHash: sha256(role) })
    .onConflictDoUpdate({ target: [workers.userId, workers.roleHash], set: { uses: sql`${workers.uses} + 1`, lastUsedAt: new Date() } })
    .returning({ id: workers.id });

  let outcome: WorkerOutcome;
  try {
    const res = await generate({
      role: speed === "fast" ? "worker_fast" : "worker_deep",
      prefer: spec.provider,
      system: role + WORKER_SUFFIX,
      messages: [{ role: "user", content: input }],
      temperature: 0.4,
      maxOutputTokens: speed === "fast" ? 2048 : 6000,
      timeoutMs: 60_000,
      audit: { ctx, purpose: "worker", conversationId: link.conversationId, messageId: link.messageId },
    });
    outcome = { ok: true, output: res.text.trim(), provider: res.provider, model: res.model, ms: Date.now() - started };
  } catch (e) {
    outcome = { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "worker failed", ms: Date.now() - started };
  }
  await db.insert(workerRuns).values({
    userId: ctx.userId,
    workerId: worker.id,
    conversationId: link.conversationId,
    messageId: link.messageId,
    task: spec.task.slice(0, 4000),
    input: input.slice(0, 100_000),
    output: outcome.output ?? null,
    provider: outcome.provider ?? null,
    model: outcome.model ?? null,
    status: outcome.ok ? "ok" : "error",
    error: outcome.error ?? null,
    latencyMs: outcome.ms,
  });
  return outcome;
}
