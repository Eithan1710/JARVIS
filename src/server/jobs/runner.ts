import "server-only";
import { eq, sql } from "drizzle-orm";
import { addDays, localParts, startOfWeek } from "@/lib/dates";
import { ensureOwner, loadContext, type UserContext } from "../context";
import { getDb } from "../db/client";
import { experiments, jobRuns } from "../db/schema";
import { errorInfo, logger } from "../logger";
import { runNotificationTick } from "../notifications/service";
import { syncAllIntegrations } from "../integrations/service";
import { closeOutMissedDays } from "../services/habits";
import { refreshInsights } from "../services/insights";
import { buildDailyBrief, buildWeeklyReview, narrateDailyBrief, narrateWeeklyReview } from "../services/reports";
import { summarizeExperiment } from "../services/experiments";

const log = logger("jobs");

/**
 * Run a job at most once per key (e.g. "insights:2026-09-29"). A crashed run is retried after
 * 15 minutes. Returns null when skipped.
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
    await db.update(jobRuns).set({ status: "ok", finishedAt: new Date(), detail: { result: result as unknown } as Record<string, unknown> }).where(eq(jobRuns.id, claimed[0].id));
    return result;
  } catch (e) {
    await db.update(jobRuns).set({ status: "failed", finishedAt: new Date(), error: e instanceof Error ? e.message.slice(0, 300) : String(e) }).where(eq(jobRuns.id, claimed[0].id));
    log.error("job failed", { job, ...errorInfo(e) });
    return null;
  }
}

/**
 * The single scheduler entry point, called every 15–30 minutes by an external cron
 * (GitHub Actions / cron-job.org / Vercel Cron). Each step is idempotent and time-gated.
 */
export async function runTick(now = new Date()) {
  const ctx: UserContext = await loadContext(await ensureOwner(), now);
  const local = localParts(now, ctx.timezone);
  const done: Record<string, unknown> = {};

  // Nightly maintenance (after 03:00 local).
  if (local.hour >= 3) {
    done.closeOut = await once("close_out", ctx.today, () => closeOutMissedDays(ctx, 14));
    done.sync = await once("sync", `${ctx.today}:${Math.floor(local.hour / 6)}`, () => syncAllIntegrations(ctx));
    done.insights = await once("insights", ctx.today, () => refreshInsights(ctx));
  }

  // Morning brief (after 05:00).
  if (local.hour >= 5) {
    done.brief = await once("daily_brief", ctx.today, async () => {
      const row = await buildDailyBrief(ctx);
      await narrateDailyBrief(ctx, row);
      return true;
    });
  }

  // Weekly review for the week that just ended (Saturday night → from Sunday 04:00).
  if (local.hour >= 4) {
    const lastWeek = addDays(startOfWeek(ctx.today), -7);
    done.weekly = await once("weekly_review", lastWeek, async () => {
      const row = await buildWeeklyReview(ctx, lastWeek);
      await narrateWeeklyReview(ctx, row);
      return true;
    });
  }

  // Summaries for experiments that just finished.
  const db = await getDb();
  const finished = await db
    .select({ id: experiments.id, endDate: experiments.endDate })
    .from(experiments)
    .where(sql`${experiments.userId} = ${ctx.userId} and ${experiments.endDate} < ${ctx.today} and ${experiments.aiSummary} is null and ${experiments.status} <> 'cancelled'`);
  for (const e of finished) done[`exp:${e.id}`] = await once("experiment_summary", e.id, () => summarizeExperiment(ctx, e.id).then(() => true));

  done.notifications = await runNotificationTick(ctx);
  return { at: now.toISOString(), local: `${ctx.today} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`, done };
}
