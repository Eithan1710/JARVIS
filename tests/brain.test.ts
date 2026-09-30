import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StreamEvent } from "@/lib/protocol";
import { parseLocalDateTime } from "@/lib/recurrence";
import { FakeProvider, leaderJson } from "./helpers";

process.env.PGLITE_DIR = "memory";
process.env.DEFAULT_TIMEZONE = "Asia/Jerusalem";

const { setProviderOverride } = await import("@/server/ai/router");
const { ensureOwner, loadContext } = await import("@/server/context");
const { parseDecision } = await import("@/server/brain/leader");
const { runTurn } = await import("@/server/brain/turn");
const { extractMemories } = await import("@/server/brain/background");
const { runTick } = await import("@/server/scheduler/tick");
const { listMessages } = await import("@/server/services/conversations");
const { listReminders } = await import("@/server/services/reminders");
const { habitStatuses } = await import("@/server/services/habits");
const { listMemories, saveMemory } = await import("@/server/services/memory");
const { searchHistory } = await import("@/server/services/history");
const { getDb } = await import("@/server/db/client");
const schema = await import("@/server/db/schema");

const TZ = "Asia/Jerusalem";
const NOW = parseLocalDateTime("2026-09-30T19:00", TZ)!;
let fake: FakeProvider;
let userId: string;

async function ctxAt(now = NOW) {
  return loadContext(userId, now);
}

async function turn(text: string, conversationId?: string | null) {
  const events: StreamEvent[] = [];
  const res = await runTurn(await ctxAt(), { conversationId, text, inputMode: "text" }, (e) => events.push(e));
  return { ...res, events };
}

beforeAll(async () => {
  userId = await ensureOwner();
});

beforeEach(() => {
  fake = new FakeProvider();
  setProviderOverride([fake]);
});

describe("parseDecision", () => {
  it("accepts a clean decision", () => {
    const d = parseDecision(leaderJson({ actions: [{ tool: "list_goals", args: {} }] }));
    expect(d.actions).toHaveLength(1);
    expect(d.final).toBe(false);
  });
  it("treats plain prose as the reply", () => {
    expect(parseDecision("שלום! מה שלומך?")).toMatchObject({ reply: "שלום! מה שלומך?", final: true, actions: [] });
  });
  it("tolerates code fences and reports invalid actions", () => {
    const d = parseDecision("```json\n" + leaderJson({ actions: [{ nope: 1 }, { tool: "open_youtube" }], reply: "x", final: true }) + "\n```");
    expect(d.actions).toHaveLength(1);
    expect(d.invalid).toHaveLength(1);
  });
});

describe("a chat turn", () => {
  it("answers directly and stores both messages", async () => {
    fake.leader.push(leaderJson({ reply: "היי! במה אפשר לעזור?" }));
    const r = await turn("היי");
    expect(r.reply).toBe("היי! במה אפשר לעזור?");
    expect(r.events.map((e) => e.type)).toEqual(["meta", "reply"]);
    const msgs = await listMessages(await ctxAt(), r.conversationId);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("creates a reminder from natural language and delivers it at the right minute", async () => {
    fake.leader.push(
      leaderJson({ actions: [{ tool: "create_reminder", args: { text: "להתקשר לאמא", at: "2026-09-30T20:00" } }], reply: "קבעתי תזכורת להיום ב־20:00.", final: true }),
    );
    const r = await turn("תזכיר לי היום ב־20:00 להתקשר לאמא");
    expect(r.reply).toBe("קבעתי תזכורת להיום ב־20:00.");
    expect(r.events.some((e) => e.type === "chip")).toBe(true);
    const ctx = await ctxAt();
    const rem = (await listReminders(ctx)).find((x) => x.text === "להתקשר לאמא")!;
    expect(rem.dueAt.toISOString()).toBe(parseLocalDateTime("2026-09-30T20:00", TZ)!.toISOString());

    expect((await runTick(parseLocalDateTime("2026-09-30T19:59", TZ)!)).reminders).toBe(0);
    expect((await runTick(parseLocalDateTime("2026-09-30T20:00", TZ)!)).reminders).toBe(1);
    expect((await runTick(parseLocalDateTime("2026-09-30T20:01", TZ)!)).reminders).toBe(0); // never twice
    const msgs = await listMessages(ctx, r.conversationId);
    expect(msgs.at(-1)).toMatchObject({ role: "assistant", kind: "reminder" });
    expect(msgs.at(-1)!.content).toContain("להתקשר לאמא");
  });

  it("feeds tool errors back to the Leader instead of claiming success", async () => {
    fake.leader.push(
      leaderJson({ actions: [{ tool: "create_reminder", args: { text: "x", at: "2020-01-01T10:00" } }], reply: "קבעתי!", final: true }),
      leaderJson({ reply: "השעה הזו כבר עברה — למתי לקבוע?" }),
    );
    const r = await turn("תזכיר לי משהו בעבר");
    expect(r.reply).toBe("השעה הזו כבר עברה — למתי לקבוע?");
    expect(fake.calls.filter((c) => c.system.startsWith("You are JARVIS")).at(-1)!.last).toContain("FAILED");
  });

  it("builds a habit with a daily nudge, skips the nudge once it's done, and counts the streak", async () => {
    fake.leader.push(leaderJson({ actions: [{ tool: "create_habit", args: { title: "לקרוא 20 דקות", time: "21:00" } }], reply: "יצאנו לדרך.", final: true }));
    await turn("אני רוצה לבנות הרגל של קריאה 20 דקות כל ערב");
    let ctx = await ctxAt();
    const [status] = await habitStatuses(ctx);
    expect(status.habit.title).toBe("לקרוא 20 דקות");
    expect((await listReminders(ctx)).some((r) => r.kind === "habit")).toBe(true);

    // Nudge fires at 21:00…
    expect((await runTick(parseLocalDateTime("2026-09-30T21:00", TZ)!)).reminders).toBe(1);
    // …the user logs it the next day before the nudge → next nudge is skipped.
    fake.leader.push(leaderJson({ actions: [{ tool: "log_habit", args: { habit: "לקרוא" } }], reply: "סימנתי ✓", final: true }));
    const events: StreamEvent[] = [];
    await runTurn(await loadContext(userId, parseLocalDateTime("2026-10-01T18:00", TZ)!), { text: "קראתי היום", inputMode: "text" }, (e) => events.push(e));
    const tick = await runTick(parseLocalDateTime("2026-10-01T21:00", TZ)!);
    expect(tick).toMatchObject({ reminders: 0, skipped: 1 });
    ctx = await loadContext(userId, parseLocalDateTime("2026-10-01T22:00", TZ)!);
    expect((await habitStatuses(ctx))[0]).toMatchObject({ doneToday: true, streak: 1 });
  });

  it("delegates to a worker and embeds its output verbatim", async () => {
    fake.leader.push(
      leaderJson({ actions: [{ worker: { title: "כותב טיוטה", role: "You are an expert copywriter who writes warm Hebrew emails.", task: "Write a short email", context: "to the landlord", speed: "deep" } }] }),
      leaderJson({ reply: "הנה טיוטה:\n\n{{result:1}}" }),
    );
    const r = await turn("תכתוב לי מייל קצר לבעל הבית");
    expect(r.reply).toContain("WORKER OUTPUT for: Write a short email");
    expect(r.outcome?.steps[0]).toMatchObject({ kind: "worker", state: "done" });
    const db = await getDb();
    expect((await db.select().from(schema.workerRuns)).length).toBeGreaterThan(0);
    expect((await db.select().from(schema.prompts)).some((p) => p.purpose === "worker")).toBe(true);
  });

  it("returns an open-link action for the browser", async () => {
    fake.leader.push(leaderJson({ actions: [{ tool: "open_youtube", args: { query: "lofi" } }], reply: "פותח לך את YouTube.", final: true }));
    const r = await turn("תפתח יוטיוב עם lofi");
    const action = r.events.find((e) => e.type === "action");
    expect(action).toMatchObject({ type: "action", action: { url: "https://www.youtube.com/results?search_query=lofi" } });
  });

  it("creates a goal and checks in on it later", async () => {
    fake.leader.push(
      leaderJson({ actions: [{ tool: "create_goal", args: { title: "לרדת 3 ק״ג", unit: "ק״ג", start: 80, target: 77, due_date: "2026-11-30", check_in_every_days: 7 } }], reply: "שמרתי את היעד.", final: true }),
    );
    await turn("אני רוצה לרדת 3 קילו בחודשיים, אני כרגע 80");
    const tick = await runTick(parseLocalDateTime("2026-10-07T19:31", TZ)!);
    expect(tick.checkIns).toBe(1);
    expect((await runTick(parseLocalDateTime("2026-10-07T19:40", TZ)!)).checkIns).toBe(0);
  });
});

describe("memory and history", () => {
  it("de-duplicates memories", async () => {
    const ctx = await ctxAt();
    const a = await saveMemory(ctx, { content: "מעדיף תשובות קצרות", kind: "preference", source: "explicit" });
    const b = await saveMemory(ctx, { content: "מעדיף תשובות קצרות.", kind: "preference", source: "extracted" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
  });

  it("extracts durable facts in the background", async () => {
    const ctx = await ctxAt();
    await extractMemories(ctx, { conversationId: "00000000-0000-0000-0000-000000000000", messageId: "00000000-0000-0000-0000-000000000000", userText: "אני עובד בפיתוח backend בגו", reply: "נשמע מעולה" });
    expect((await listMemories(ctx)).some((m) => m.content === "עובד בפיתוח backend")).toBe(true);
  });

  it("finds past messages despite Hebrew prefixes", async () => {
    fake.leader.push(leaderJson({ reply: "אחלה." }));
    await turn("היום עבדתי על הפרויקט בגיטהאב");
    const hits = await searchHistory(await ctxAt(), "מה עשיתי בגיטהאב?");
    expect(hits[0]?.snippet).toContain("גיטהאב");
  });

  it("puts memory and the current time into the Leader's context", async () => {
    fake.leader.push(leaderJson({ reply: "כן." }));
    await turn("מה אתה יודע עליי?");
    const sys = fake.calls.find((c) => c.system.startsWith("You are JARVIS"))!.system;
    expect(sys).toContain("מעדיף תשובות קצרות");
    expect(sys).toContain("Wednesday 2026-09-30 19:00");
  });
});
