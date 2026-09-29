import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { addDays, diffDays, type ISODate } from "@/lib/dates";
import { aggregateNoun, formatFieldValue } from "@/lib/frame-fields";
import { formatRange } from "@/lib/format";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { experiments, habits } from "../db/schema";
import { notFound } from "../api/handler";
import { comparePeriods, diffText, makeLookup } from "../analytics/compare";
import { describeEffect, mean } from "../analytics/stats";
import { aiConfigured, runStructuredTask } from "../ai/router";
import { loadFrame } from "./frame";

export const experimentInput = z.object({
  title: z.string().trim().min(2).max(120),
  hypothesis: z.string().trim().max(500).nullish(),
  intervention: z.string().trim().max(300).nullish(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationDays: z.number().int().min(5).max(120),
  baselineDays: z.number().int().min(7).max(90).default(21),
  targetKeys: z.array(z.string().max(60)).min(1).max(6),
  /** Creates a daily yes/no habit to track compliance (e.g. "לישון לפני 23:30"). */
  complianceHabitName: z.string().trim().max(80).nullish(),
});

export type ExperimentRow = typeof experiments.$inferSelect;

function statusFor(e: Pick<ExperimentRow, "startDate" | "endDate" | "status">, today: ISODate): ExperimentRow["status"] {
  if (e.status === "cancelled") return "cancelled";
  if (today < e.startDate) return "planned";
  if (today <= e.endDate) return "active";
  return "completed";
}

export async function listExperiments(ctx: UserContext) {
  const db = await getDb();
  const rows = await db.select().from(experiments).where(eq(experiments.userId, ctx.userId)).orderBy(desc(experiments.startDate));
  return rows.map((r) => ({ ...r, status: statusFor(r, ctx.today), dayIndex: Math.min(diffDays(ctx.today, r.startDate) + 1, diffDays(r.endDate, r.startDate) + 1), totalDays: diffDays(r.endDate, r.startDate) + 1 }));
}

export async function getExperiment(ctx: UserContext, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(experiments).where(and(eq(experiments.id, id), eq(experiments.userId, ctx.userId))).limit(1);
  if (!row) throw notFound("הניסוי");
  return { ...row, status: statusFor(row, ctx.today), totalDays: diffDays(row.endDate, row.startDate) + 1, dayIndex: Math.min(diffDays(ctx.today, row.startDate) + 1, diffDays(row.endDate, row.startDate) + 1) };
}

export async function createExperiment(ctx: UserContext, input: z.infer<typeof experimentInput>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    let complianceHabitId: string | null = null;
    if (input.complianceHabitName) {
      const [h] = await tx
        .insert(habits)
        .values({ userId: ctx.userId, name: input.complianceHabitName, tier: "side", frequency: "daily", startDate: input.startDate, source: "experiment", description: `חלק מהניסוי „${input.title}”` })
        .returning();
      complianceHabitId = h.id;
    }
    const [row] = await tx
      .insert(experiments)
      .values({
        userId: ctx.userId,
        title: input.title,
        hypothesis: input.hypothesis ?? null,
        intervention: input.intervention ?? null,
        startDate: input.startDate,
        endDate: addDays(input.startDate, input.durationDays - 1),
        baselineDays: input.baselineDays,
        targetKeys: input.targetKeys,
        complianceHabitId,
        status: input.startDate > ctx.today ? "planned" : "active",
      })
      .returning();
    return row;
  });
}

export async function cancelExperiment(ctx: UserContext, id: string) {
  await getExperiment(ctx, id);
  const db = await getDb();
  const [row] = await db.update(experiments).set({ status: "cancelled" }).where(eq(experiments.id, id)).returning();
  if (row.complianceHabitId) await db.update(habits).set({ archivedAt: new Date() }).where(eq(habits.id, row.complianceHabitId));
  return row;
}

export async function deleteExperiment(ctx: UserContext, id: string) {
  await getExperiment(ctx, id);
  const db = await getDb();
  await db.delete(experiments).where(eq(experiments.id, id));
}

export interface ExperimentResult {
  computedAt: string;
  baseline: { from: ISODate; to: ISODate };
  during: { from: ISODate; to: ISODate };
  after: { from: ISODate; to: ISODate } | null;
  compliance: { rate: number | null; days: number } | null;
  targets: {
    key: string;
    label: string;
    baseline: string;
    during: string;
    after: string | null;
    difference: string;
    effect: string;
    n: [number, number];
    confidence: string;
    confidenceLevel: string;
    direction: "up" | "down" | "flat";
    good: boolean | null;
  }[];
  confounders: { key: string; label: string; baseline: string; during: string }[];
  dataNotes: string[];
  facts: { id: string; text: string }[];
}

export async function analyzeExperiment(ctx: UserContext, id: string): Promise<ExperimentResult> {
  const e = await getExperiment(ctx, id);
  const baseline = { from: addDays(e.startDate, -e.baselineDays), to: addDays(e.startDate, -1) };
  const duringTo = e.endDate < ctx.today ? e.endDate : ctx.today;
  const during = { from: e.startDate, to: duringTo };
  const afterFrom = addDays(e.endDate, 1);
  const after = afterFrom <= ctx.today ? { from: afterFrom, to: addDays(afterFrom, 13) < ctx.today ? addDays(afterFrom, 13) : ctx.today } : null;
  const { frame, habitNames, custom } = await loadFrame(ctx, baseline.from, after?.to ?? duringTo);
  const lookup = makeLookup(habitNames, custom);

  const facts: ExperimentResult["facts"] = [];
  let n = 0;
  const fact = (text: string) => facts.push({ id: `E${++n}`, text });

  let compliance: ExperimentResult["compliance"] = null;
  if (e.complianceHabitId) {
    const vals = frame.filter((r) => r.date >= during.from && r.date <= during.to).map((r) => r.v[`habit:${e.complianceHabitId}`] ?? null);
    const known = vals.filter((v): v is number => v != null);
    compliance = { rate: known.length ? mean(known) : null, days: known.length };
    if (known.length) fact(`עמידה בניסוי: ${Math.round((compliance.rate ?? 0) * 100)}% מהימים (${known.length} ימים עם דיווח).`);
  }

  const targets: ExperimentResult["targets"] = [];
  for (const key of e.targetKeys) {
    const info = lookup(key);
    const res = comparePeriods(frame, key, during, baseline);
    const { a, b, diff, d } = res.comparison;
    const afterMean = after ? mean(frame.filter((r) => r.date >= after.from && r.date <= after.to).map((r) => r.v[key] ?? null)) : null;
    const direction = diff == null || describeEffect(d) === "none" ? "flat" : diff > 0 ? "up" : "down";
    targets.push({
      key,
      label: info.label,
      baseline: formatFieldValue(info, b.mean),
      during: formatFieldValue(info, a.mean),
      after: after ? formatFieldValue(info, afterMean) : null,
      difference: diffText(info, res.comparison),
      effect: describeEffect(d),
      n: [b.n, a.n],
      confidence: res.confidence.reason,
      confidenceLevel: res.confidence.level,
      direction,
      good: direction === "flat" || info.higherIsBetter == null ? null : info.higherIsBetter === (direction === "up"),
    });
    fact(`${aggregateNoun(info)}: לפני הניסוי ${formatFieldValue(info, b.mean)} (${b.n} ימים), במהלכו ${formatFieldValue(info, a.mean)} (${a.n} ימים)${after ? `, אחריו ${formatFieldValue(info, afterMean)}` : ""}. ${res.confidence.reason}`);
  }

  // Other signals that moved at the same time are possible confounders.
  const confounders: ExperimentResult["confounders"] = [];
  for (const key of ["sleep_hours", "exercised", "meetings", "work_hours", "steps", "mood", "energy", "spending", "calendar_hours"]) {
    if (e.targetKeys.includes(key)) continue;
    const res = comparePeriods(frame, key, during, baseline);
    if (res.comparison.a.n >= 4 && res.comparison.b.n >= 4 && Math.abs(res.comparison.d ?? 0) >= 0.6) {
      const info = lookup(key);
      confounders.push({ key, label: info.label, baseline: formatFieldValue(info, res.comparison.b.mean), during: formatFieldValue(info, res.comparison.a.mean) });
      fact(`בזמן הניסוי נמדד גם הבדל ב${info.label}: ${formatFieldValue(info, res.comparison.b.mean)} לפני, ${formatFieldValue(info, res.comparison.a.mean)} במהלך.`);
    }
  }

  const dataNotes: string[] = [];
  const duringDays = diffDays(during.to, during.from) + 1;
  if (e.status === "active") dataNotes.push(`הניסוי עדיין רץ (יום ${e.dayIndex} מתוך ${e.totalDays}) — התוצאות חלקיות.`);
  if (targets.some((t) => t.n[1] < Math.min(7, duringDays))) dataNotes.push("בחלק מהמדדים יש מעט ימים עם נתונים בתקופת הניסוי.");
  if (compliance && (compliance.rate ?? 0) < 0.6) dataNotes.push("העמידה בניסוי הייתה חלקית, כך שקשה לייחס שינויים לניסוי עצמו.");
  if (confounders.length) dataNotes.push("דברים נוספים השתנו באותה תקופה — הם עשויים להסביר חלק מהתוצאה.");

  const result: ExperimentResult = { computedAt: new Date().toISOString(), baseline, during, after, compliance, targets, confounders, dataNotes, facts };
  const db = await getDb();
  await db.update(experiments).set({ result: result as unknown as Record<string, unknown>, status: e.status === "cancelled" ? "cancelled" : e.status }).where(eq(experiments.id, id));
  return result;
}

const experimentSummarySchema = z.object({
  verdict: z.enum(["promising", "no_clear_change", "negative", "inconclusive"]),
  headline: z.string().max(300),
  observations: z.array(z.object({ text: z.string().max(300), evidence: z.array(z.string()).default([]) })).max(5).default([]),
  interpretation: z.array(z.string().max(400)).max(4).default([]),
  nextSteps: z.array(z.string().max(250)).max(3).default([]),
});

export type ExperimentSummary = z.infer<typeof experimentSummarySchema> & { generated: "ai" | "rules" };

function deterministicSummary(r: ExperimentResult): ExperimentSummary {
  const meaningful = r.targets.filter((t) => t.direction !== "flat" && t.confidenceLevel !== "insufficient");
  const verdict: ExperimentSummary["verdict"] =
    r.targets.every((t) => t.confidenceLevel === "insufficient") ? "inconclusive" : !meaningful.length ? "no_clear_change" : meaningful.every((t) => t.good !== false) ? "promising" : "negative";
  const headline =
    verdict === "inconclusive" ? "עדיין אין מספיק נתונים כדי לומר משהו על הניסוי." : verdict === "no_clear_change" ? "לא נראה שינוי ברור במדדים שבחרת." : verdict === "promising" ? "המדדים שבחרת השתנו בכיוון הרצוי בזמן הניסוי." : "חלק מהמדדים השתנו בכיוון הלא רצוי בזמן הניסוי.";
  return {
    verdict,
    headline,
    observations: r.facts.slice(0, 5).map((f) => ({ text: f.text, evidence: [f.id] })),
    interpretation: r.dataNotes,
    nextSteps: verdict === "inconclusive" ? ["להמשיך לאסוף נתונים ולבדוק שוב בעוד שבוע."] : [],
    generated: "rules",
  };
}

export async function summarizeExperiment(ctx: UserContext, id: string): Promise<ExperimentSummary> {
  const e = await getExperiment(ctx, id);
  const r = await analyzeExperiment(ctx, id);
  let summary: ExperimentSummary = deterministicSummary(r);
  if (aiConfigured() && ctx.settings.ai.enabled && r.facts.length) {
    try {
      const { value } = await runStructuredTask({
        ctx,
        type: "experiment_summary",
        tier: "balanced",
        system: `You summarize a personal self-experiment for a Hebrew-speaking user. Experiment: "${e.title}"${e.hypothesis ? `, hypothesis: "${e.hypothesis}"` : ""}. Baseline ${formatRange(r.baseline.from, r.baseline.to)}, experiment ${formatRange(r.during.from, r.during.to)}.
Strictly separate OBSERVATIONS (what the numbers show, cite fact ids) from INTERPRETATION (what it might mean, with explicit uncertainty, possible confounders, regression to the mean, small samples). No causal certainty. Use only the facts. Write natural Hebrew.
JSON: {"verdict":"promising|no_clear_change|negative|inconclusive","headline":"","observations":[{"text":"","evidence":["E1"]}],"interpretation":[""],"nextSteps":[""]}`,
        messages: [{ role: "user", content: [...r.facts.map((f) => `[${f.id}] ${f.text}`), ...r.dataNotes.map((d) => `NOTE: ${d}`)].join("\n") }],
        schema: experimentSummarySchema,
        dataScope: { experimentFacts: r.facts.length },
        temperature: 0.3,
      });
      const ids = new Set(r.facts.map((f) => f.id));
      summary = { ...value, observations: value.observations.map((o) => ({ ...o, evidence: o.evidence.filter((x) => ids.has(x)) })), generated: "ai" };
    } catch {
      /* deterministic summary stands */
    }
  }
  const db = await getDb();
  await db.update(experiments).set({ aiSummary: summary as unknown as Record<string, unknown> }).where(eq(experiments.id, id));
  return summary;
}
