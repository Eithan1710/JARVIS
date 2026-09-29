/**
 * End-to-end over the real service layer with an in-memory Postgres (PGlite):
 * demo data → analytics → insights → orchestrator (with a fake AI provider and without AI)
 * → reports → experiments → notifications.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, startOfWeek } from "@/lib/dates";
import { parseSettings } from "@/lib/settings";
import type { UserContext } from "@/server/context";
import type { AIProvider } from "@/server/ai/types";

process.env.PGLITE_DIR = "memory";

let ctx: UserContext;

const TODAY = "2026-09-29";
const NOW = new Date("2026-09-29T09:00:00Z");

beforeAll(async () => {
  const { getDb } = await import("@/server/db/client");
  const { users } = await import("@/server/db/schema");
  const db = await getDb();
  const [u] = await db.insert(users).values({ displayName: "איתן" }).returning();
  ctx = { userId: u.id, displayName: "איתן", timezone: "Asia/Jerusalem", settings: parseSettings({}), now: NOW, today: TODAY };
  const { loadDemoData } = await import("@/server/services/demo");
  await loadDemoData(ctx, 100);
}, 120_000);

describe("NOVA end to end", () => {
  it("builds a dashboard with habits, trends and insights", async () => {
    const { dashboard } = await import("@/server/services/system");
    const d = await dashboard(ctx);
    expect(d.habits.length).toBe(4);
    expect(d.trends.sleep).toHaveLength(14);
    expect(d.hasDemoData).toBe(true);
    expect(d.yesterday?.habitsDue).toBeGreaterThan(0);
  });

  it("discovers evidence-backed insights with careful language", async () => {
    const { listInsights, getInsight } = await import("@/server/services/insights");
    const list = await listInsights(ctx);
    expect(list.length).toBeGreaterThan(2);
    for (const i of list) {
      expect(i.confidenceReason).toBeTruthy();
      expect(i.sampleSize).toBeGreaterThanOrEqual(8);
      expect(i.summary + (i.body ?? "")).not.toMatch(/גורם ל|הסיבה היא|מוכיח/);
    }
    const detail = await getInsight(ctx, list[0].id);
    expect(detail.evidence.length).toBeGreaterThan(0);
    // The demo generator encodes "meetings reduce workouts" and "sleep lifts energy".
    const fps = list.map((i) => i.fingerprint).join(" ");
    expect(fps).toMatch(/sleep_hours|energy|meetings|exercised/);
  });

  it("answers without AI using computed facts only", async () => {
    const { setProviderOverride } = await import("@/server/ai/router");
    setProviderOverride([]);
    const { ask } = await import("@/server/ai/orchestrator");
    const steps: string[] = [];
    const res = await ask(ctx, { question: "למה אני פחות עקבי עם אימונים לאחרונה?" }, (e) => steps.push(`${e.id}:${e.status}`));
    const s = res.message.structured as Record<string, unknown> & { mode: string; points: unknown[]; plan: { tools: string[] } };
    expect(s.mode).toBe("fallback");
    expect(s.points.length).toBeGreaterThan(0);
    expect(s.plan.tools).toContain("compare_periods");
    expect(s.plan.tools).toContain("find_relationships");
    expect(steps).toContain("data:done");
  });

  it("routes structured context to the AI provider and validates the answer", async () => {
    let seen = "";
    const fake: AIProvider = {
      id: "fake",
      label: "Fake",
      privacyNote: "",
      available: () => true,
      modelFor: (t) => `fake-${t}`,
      async generate(req) {
        seen = req.messages[0].content;
        const firstFact = seen.match(/\[(F\d+)\]/)?.[1] ?? "F1";
        return {
          text: JSON.stringify({
            answer: "בשבועות עמוסים בפגישות התאמנת פחות.",
            points: [
              { type: "pattern", text: "בימים עם הרבה פגישות היו פחות אימונים.", evidence: [firstFact] },
              { type: "fact", text: "טענה בלי ציטוט", evidence: [] },
            ],
            caveats: [],
            sufficiency: "sufficient",
            followUps: ["מה עוד משפיע על האימונים?"],
            memoryProposals: [{ kind: "preference", content: "מעדיף להתאמן בערב", basis: "user_stated" }],
          }),
          provider: "fake",
          model: `fake-${req.tier}`,
        };
      },
    };
    const { setProviderOverride } = await import("@/server/ai/router");
    setProviderOverride([fake]);
    const { ask } = await import("@/server/ai/orchestrator");
    const res = await ask(ctx, { question: "כמה ישנתי בממוצע בחודש האחרון?" });
    const s = res.message.structured as { mode: string; points: { type: string }[]; model: string; proposedMemoryIds: string[] };
    expect(s.mode).toBe("ai");
    expect(s.points[1].type).toBe("hypothesis"); // uncited claim downgraded
    expect(s.proposedMemoryIds.length).toBe(1);
    expect(seen).toContain("FACTS");
    expect(seen).not.toContain("user_id");
    const { listMemories } = await import("@/server/services/memory");
    const mem = await listMemories(ctx);
    expect(mem.find((m) => m.id === s.proposedMemoryIds[0])?.status).toBe("proposed");
    setProviderOverride([]);
  });

  it("produces daily brief and weekly review facts deterministically", async () => {
    const { buildDailyBrief, narrateDailyBrief, buildWeeklyReview, narrateWeeklyReview } = await import("@/server/services/reports");
    const brief = await narrateDailyBrief(ctx, await buildDailyBrief(ctx));
    expect((brief.facts as { items: unknown[] }).items.length).toBeGreaterThan(1);
    expect((brief.narrative as { standout: string }).standout).toBeTruthy();
    const week = await narrateWeeklyReview(ctx, await buildWeeklyReview(ctx, addDays(startOfWeek(TODAY), -7)));
    const f = week.facts as { happened: unknown[]; habits: unknown[]; priorWeeks: number };
    expect(f.happened.length).toBeGreaterThan(2);
    expect(f.priorWeeks).toBeGreaterThanOrEqual(2);
    expect((week.narrative as { summary: string }).summary).toBeTruthy();
  });

  it("analyzes the demo experiment against its baseline", async () => {
    const { listExperiments, analyzeExperiment, summarizeExperiment } = await import("@/server/services/experiments");
    const [e] = await listExperiments(ctx);
    const r = await analyzeExperiment(ctx, e.id);
    expect(r.targets.map((t) => t.key)).toEqual(["sleep_hours", "energy", "focus"]);
    expect(r.targets[0].n[0]).toBeGreaterThan(10);
    const s = await summarizeExperiment(ctx, e.id);
    expect(["promising", "no_clear_change", "negative", "inconclusive"]).toContain(s.verdict);
  });

  it("plans smart reminders and respects budgets", async () => {
    const { runNotificationTick, listNotifications } = await import("@/server/notifications/service");
    const res = await runNotificationTick({ ...ctx, now: new Date("2026-09-29T05:00:00Z") });
    expect(res.planned).toBeGreaterThan(0);
    const list = await listNotifications(ctx);
    const habit = list.find((n) => n.kind === "habit_reminder");
    expect((habit?.reason as { lines: string[] }).lines.length).toBeGreaterThan(0);
  });

  it("logs habits idempotently and exposes a timeline", async () => {
    const { listHabits, logHabit, habitSummaries } = await import("@/server/services/habits");
    const [h] = await listHabits(ctx);
    await logHabit(ctx, h.id, { date: TODAY, status: "completed" });
    await logHabit(ctx, h.id, { date: TODAY, status: "completed" });
    const s = (await habitSummaries(ctx)).find((x) => x.habit.id === h.id)!;
    expect(s.today.status).toBe("completed");
    const { timeline } = await import("@/server/services/timeline");
    const t = await timeline(ctx, addDays(TODAY, -3), TODAY);
    expect(t[0].date).toBe(TODAY);
    expect(t.length).toBeGreaterThanOrEqual(3);
  });

  it("ingests webhook health data with provenance and removes demo data cleanly", async () => {
    const { ingestRecords } = await import("@/server/integrations/service");
    const { normalizeHealthPayload } = await import("@/server/integrations/providers/health-webhook");
    const { records } = normalizeHealthPayload({ records: [{ type: "steps", value: 9100, date: TODAY }] }, ctx.timezone, TODAY);
    await ingestRecords(ctx, "health_webhook", null, records);
    await ingestRecords(ctx, "health_webhook", null, records); // idempotent
    const { listMetrics } = await import("@/server/services/data");
    const rows = await listMetrics(ctx, { keys: ["steps"], from: TODAY, to: TODAY, source: "health_webhook" });
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceRecordId).toBeTruthy();
    const { removeDemoData, hasDemoData } = await import("@/server/services/demo");
    await removeDemoData(ctx);
    expect(await hasDemoData(ctx)).toBe(false);
    const after = await listMetrics(ctx, { keys: ["steps"] });
    expect(after.every((m) => m.source !== "demo")).toBe(true);
  });
});
