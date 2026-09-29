import "server-only";
import { and, asc, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { addDays } from "@/lib/dates";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { insightEvidence, insights } from "../db/schema";
import { notFound } from "../api/handler";
import { makeLookup } from "../analytics/compare";
import { discoverInsights, type InsightDraft } from "../analytics/insights-engine";
import { loadFrame } from "./frame";
import { listHabits } from "./habits";
import { logger } from "../logger";

const log = logger("insights");

export type InsightRow = typeof insights.$inferSelect;
export type InsightStatus = InsightRow["status"];

/** Run discovery over the last 120 days and upsert results. Findings that no longer hold are expired. */
export async function refreshInsights(ctx: UserContext) {
  const from = addDays(ctx.today, -119);
  const { frame, habitNames, custom } = await loadFrame(ctx, from, ctx.today);
  const habitRows = await listHabits(ctx);
  const lookup = makeLookup(habitNames, custom);
  const drafts = discoverInsights(frame, lookup, {
    mainHabitIds: habitRows.filter((h) => h.tier === "main").map((h) => h.id),
    linkedMetrics: habitRows.map((h) => h.metricKey).filter((k): k is string => Boolean(k)),
    today: ctx.today,
  });
  await saveDrafts(ctx, drafts);
  log.info("refreshed", { found: drafts.length });
  return drafts.length;
}

async function saveDrafts(ctx: UserContext, drafts: InsightDraft[]) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const d of drafts) {
      const values = {
        userId: ctx.userId,
        kind: d.kind,
        evidenceLevel: d.evidenceLevel,
        title: d.title,
        summary: d.summary,
        body: d.body ?? null,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        sampleSize: d.sampleSize,
        confidence: d.confidence,
        confidenceReason: d.confidenceReason,
        caveats: d.caveats,
        fingerprint: d.fingerprint,
        score: d.score,
        generatedBy: "analytics" as const,
        data: d.data,
      };
      const [existing] = await tx
        .select({ id: insights.id, status: insights.status, data: insights.data })
        .from(insights)
        .where(and(eq(insights.userId, ctx.userId), eq(insights.fingerprint, d.fingerprint)))
        .limit(1);
      let id: string;
      if (existing) {
        // A finding whose direction flipped is effectively new information.
        const flipped = existing.data?.direction !== undefined && existing.data.direction !== d.data.direction;
        const status: InsightStatus =
          existing.status === "pinned" ? "pinned" : existing.status === "dismissed" && !flipped ? "dismissed" : flipped || existing.status === "expired" ? "new" : existing.status;
        await tx.update(insights).set({ ...values, status }).where(eq(insights.id, existing.id));
        id = existing.id;
        await tx.delete(insightEvidence).where(eq(insightEvidence.insightId, id));
      } else {
        const [row] = await tx.insert(insights).values(values).returning({ id: insights.id });
        id = row.id;
      }
      if (d.evidence.length) {
        await tx.insert(insightEvidence).values(d.evidence.map((e, i) => ({ insightId: id, kind: e.kind, label: e.label, data: e.data, sortOrder: i })));
      }
    }
    // Analytics findings that did not re-appear this run no longer hold on current data.
    const fps = drafts.map((d) => d.fingerprint);
    const stale = and(
      eq(insights.userId, ctx.userId),
      eq(insights.generatedBy, "analytics"),
      inArray(insights.status, ["new", "seen"]),
      ...(fps.length ? [notInArray(insights.fingerprint, fps)] : []),
    );
    await tx.update(insights).set({ status: "expired" }).where(stale);
  });
}

export async function listInsights(ctx: UserContext, opts: { includeDismissed?: boolean; limit?: number } = {}) {
  const db = await getDb();
  const conds = [eq(insights.userId, ctx.userId), ne(insights.status, "expired")];
  if (!opts.includeDismissed) conds.push(ne(insights.status, "dismissed"));
  const rows = await db
    .select()
    .from(insights)
    .where(and(...conds))
    .orderBy(desc(insights.score))
    .limit(opts.limit ?? 50);
  // Pinned first, then new, then by score.
  const rank = (s: InsightStatus) => (s === "pinned" ? 0 : s === "new" ? 1 : 2);
  return rows.sort((a, b) => rank(a.status) - rank(b.status) || b.score - a.score);
}

export async function getInsight(ctx: UserContext, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(insights).where(and(eq(insights.id, id), eq(insights.userId, ctx.userId))).limit(1);
  if (!row) throw notFound("התובנה");
  const evidence = await db.select().from(insightEvidence).where(eq(insightEvidence.insightId, id)).orderBy(asc(insightEvidence.sortOrder));
  return { insight: row, evidence };
}

export async function setInsightStatus(ctx: UserContext, id: string, status: InsightStatus) {
  const db = await getDb();
  const [row] = await db.update(insights).set({ status }).where(and(eq(insights.id, id), eq(insights.userId, ctx.userId))).returning();
  if (!row) throw notFound("התובנה");
  return row;
}

export async function markInsightsSeen(ctx: UserContext, ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  await db
    .update(insights)
    .set({ status: "seen" })
    .where(and(eq(insights.userId, ctx.userId), inArray(insights.id, ids), eq(insights.status, "new")));
}
