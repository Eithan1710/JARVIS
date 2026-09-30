import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { jobRuns } from "../db/schema";
import { errorInfo, logger } from "../logger";

const log = logger("jobs");

/**
 * Run a job at most once per key (e.g. "memory-digest:2026-09-30"). A crashed run is retried
 * after 15 minutes. Returns null when skipped.
 */
export async function once<T>(job: string, key: string, fn: () => Promise<T>): Promise<T | null> {
  const db = await getDb();
  const runKey = `${job}:${key}`;
  const claimed = await db
    .insert(jobRuns)
    .values({ job, runKey, status: "running" })
    .onConflictDoUpdate({
      target: jobRuns.runKey,
      set: { status: "running", startedAt: new Date(), error: null },
      setWhere: sql`${jobRuns.status} = 'failed' OR (${jobRuns.status} = 'running' AND ${jobRuns.startedAt} < now() - interval '15 minutes')`,
    })
    .returning({ id: jobRuns.id });
  if (!claimed.length) return null;
  try {
    const result = await fn();
    await db
      .update(jobRuns)
      .set({ status: "ok", finishedAt: new Date(), detail: { result: result as unknown } as Record<string, unknown> })
      .where(eq(jobRuns.id, claimed[0].id));
    return result;
  } catch (e) {
    await db
      .update(jobRuns)
      .set({ status: "failed", finishedAt: new Date(), error: e instanceof Error ? e.message.slice(0, 300) : String(e) })
      .where(eq(jobRuns.id, claimed[0].id));
    log.error("job failed", { job, ...errorInfo(e) });
    return null;
  }
}
