import "server-only";
/**
 * Step 3–5 of the orchestrator: the personal-data tool catalogue. Every tool is a
 * deterministic function over the database/Day Frame that returns *pre-computed facts*
 * in Hebrew with stable ids. The AI only ever sees these facts — never raw tables.
 */
import { z } from "zod";
import { addDays, diffDays, startOfWeek, type ISODate } from "@/lib/dates";
import { aggregateNoun, formatFieldValue } from "@/lib/frame-fields";
import { formatCurrency, formatDate, formatRange, WEEKDAY_NAMES } from "@/lib/format";
import { SPENDING_LABEL } from "@/lib/metrics";
import type { UserContext } from "../../context";
import {
  compareCondition,
  comparePeriods,
  conditionCaveats,
  conditionEvidence,
  dayOfWeek,
  diffText,
  keySnapshot,
  seriesEvidence,
  type EvidenceBlock,
  type FieldLookup,
} from "../../analytics/compare";
import { coverage, weeklyMeans, type DayRow } from "../../analytics/dayframe";
import { describeEffect, EFFECT_LABEL } from "../../analytics/stats";
import { habitSummaries } from "../../services/habits";
import { listGoals } from "../../services/goals";
import { listCheckins, listJournal, searchTerms } from "../../services/journal";
import { listTransactions, spendingByCategory, listCalendar } from "../../services/data";
import { listInsights } from "../../services/insights";
import { searchMemories } from "../../services/memory";
import { zonedTime } from "@/lib/dates";

export interface Fact {
  id: string;
  text: string;
  /** fact = observed record; metric = calculated; pattern = comparison/relationship */
  kind: "fact" | "metric" | "pattern";
  tool: string;
}

export interface ToolOutput {
  tool: string;
  title: string;
  facts: Omit<Fact, "id" | "tool">[];
  evidence: EvidenceBlock[];
  /** Personal free text included (journal/notes), counted separately for the privacy audit. */
  texts?: { date: ISODate; text: string }[];
  scope: Record<string, number>;
}

export interface ToolEnv {
  ctx: UserContext;
  frame: DayRow[];
  lookup: FieldLookup;
  habitNames: Map<string, string>;
}

const range = z.object({ from: z.string(), to: z.string() });

interface ToolDef<A> {
  name: string;
  /** Planner-facing description. */
  description: string;
  args: z.ZodType<A>;
  run: (env: ToolEnv, args: A) => Promise<ToolOutput>;
}

function inRange(frame: DayRow[], from: ISODate, to: ISODate) {
  return frame.filter((r) => r.date >= from && r.date <= to);
}

/* ------------------------------------------------------------------ */

const get_metric_summary: ToolDef<{ keys: string[]; from: ISODate; to: ISODate }> = {
  name: "get_metric_summary",
  description: "Averages, medians, ranges and first-half vs second-half change for Day Frame keys (sleep_hours, mood, energy, focus, steps, exercised, habit_rate, work_hours, meetings, spending, weight…) over a date range.",
  args: z.object({ keys: z.array(z.string()).min(1).max(8), from: z.string(), to: z.string() }),
  async run(env, a) {
    const f = inRange(env.frame, a.from, a.to);
    const facts: ToolOutput["facts"] = [];
    const evidence: EvidenceBlock[] = [];
    const scope: Record<string, number> = {};
    for (const key of a.keys) {
      const s = keySnapshot(f, key, env.lookup);
      const info = env.lookup(key);
      if (!s) {
        facts.push({ kind: "fact", text: `אין נתונים על ${info.label} ${formatRange(a.from, a.to)}.` });
        continue;
      }
      scope[key] = s.n;
      facts.push({
        kind: "metric",
        text: `${aggregateNoun(info)} ${formatRange(a.from, a.to)}: ${s.mean} (חציון ${s.median}, טווח ${s.min}–${s.max}), על סמך ${s.n} ימים עם נתונים מתוך ${f.length}.`,
      });
      if (f.length >= 14 && s.raw.first != null && s.raw.second != null) {
        facts.push({ kind: "metric", text: `${info.label}: במחצית הראשונה של התקופה ${s.firstHalfMean}, במחצית השנייה ${s.secondHalfMean}.` });
      }
      evidence.push(seriesEvidence(f, key, info, `${info.label} ${formatRange(a.from, a.to)}`, f.length > 45));
    }
    return { tool: this.name, title: "סיכום מדדים", facts, evidence, scope };
  },
};

const compare_periods: ToolDef<{ keys: string[]; recent: { from: ISODate; to: ISODate }; baseline: { from: ISODate; to: ISODate }; recentLabel?: string; baselineLabel?: string }> = {
  name: "compare_periods",
  description: "Compare Day Frame keys between a recent period and a baseline period (means, difference, effect size, confidence).",
  args: z.object({ keys: z.array(z.string()).min(1).max(10), recent: range, baseline: range, recentLabel: z.string().optional(), baselineLabel: z.string().optional() }),
  async run(env, a) {
    const facts: ToolOutput["facts"] = [];
    const evidence: EvidenceBlock[] = [];
    const scope: Record<string, number> = {};
    const rl = a.recentLabel ?? formatRange(a.recent.from, a.recent.to);
    const bl = a.baselineLabel ?? formatRange(a.baseline.from, a.baseline.to);
    for (const key of a.keys) {
      const info = env.lookup(key);
      const res = comparePeriods(env.frame, key, a.recent, a.baseline);
      const { a: A, b: B } = res.comparison;
      scope[key] = A.n + B.n;
      if (A.n < 3 || B.n < 3) {
        facts.push({ kind: "fact", text: `אין מספיק נתונים להשוות את ${info.label} (${A.n} ימים ${rl}, ${B.n} ימים ${bl}).` });
        continue;
      }
      const eff = describeEffect(res.comparison.d);
      facts.push({
        kind: "metric",
        text: `${aggregateNoun(info)} ${rl}: ${formatFieldValue(info, A.mean)} (${A.n} ימים), לעומת ${formatFieldValue(info, B.mean)} ${bl} (${B.n} ימים). הפרש: ${diffText(info, res.comparison)}${eff === "none" ? " — הבדל זניח ביחס לתנודות הרגילות" : eff === "small" ? " — הבדל קטן" : eff === "moderate" ? " — הבדל בינוני" : " — הבדל גדול"}. ${res.confidence.reason}`,
      });
      evidence.push({
        kind: "comparison",
        label: `${info.label}: ${rl} מול ${bl}`,
        data: {
          metric: info.label,
          groups: [
            { label: rl, n: A.n, mean: formatFieldValue(info, A.mean), median: formatFieldValue(info, A.median), raw: A.mean },
            { label: bl, n: B.n, mean: formatFieldValue(info, B.mean), median: formatFieldValue(info, B.median), raw: B.mean },
          ],
          difference: diffText(info, res.comparison),
        },
      });
    }
    return { tool: this.name, title: "השוואת תקופות", facts, evidence, scope };
  },
};

const FACTOR_CANDIDATES: { key: string; mode: "binary" | "threshold" | "median"; threshold?: number; lags: number[] }[] = [
  { key: "sleep_hours", mode: "threshold", threshold: 7, lags: [0] },
  { key: "bedtime", mode: "median", lags: [0] },
  { key: "exercised", mode: "binary", lags: [0, 1] },
  { key: "meetings", mode: "median", lags: [0] },
  { key: "calendar_hours", mode: "median", lags: [0] },
  { key: "work_hours", mode: "median", lags: [0, 1] },
  { key: "steps", mode: "median", lags: [0] },
  { key: "screen_time_hours", mode: "median", lags: [0] },
  { key: "mood", mode: "median", lags: [0] },
  { key: "energy", mode: "median", lags: [0] },
  { key: "isWeekend", mode: "binary", lags: [0] },
];

const find_relationships: ToolDef<{ outcome: string; from: ISODate; to: ISODate; habitIds?: string[] }> = {
  name: "find_relationships",
  description: "For one outcome key, test every available factor (sleep, exercise, meetings, work hours, steps, screen time, mood, energy, weekend, selected habits) and return the strongest associations with group means, sample sizes, confidence and confounders.",
  args: z.object({ outcome: z.string(), from: z.string(), to: z.string(), habitIds: z.array(z.string()).optional() }),
  async run(env, a) {
    const f: DayRow[] = inRange(env.frame, a.from, a.to).map((r) => ({ ...r, v: { ...r.v, isWeekend: r.isWeekend ? 1 : 0 } }));
    const out = env.lookup(a.outcome);
    if (coverage(f, a.outcome) < 6) {
      return { tool: this.name, title: `מה קשור ל${out.label}`, facts: [{ kind: "fact", text: `יש רק ${coverage(f, a.outcome)} ימים עם נתונים על ${out.label} ${formatRange(a.from, a.to)} — מעט מדי כדי לחפש קשרים.` }], evidence: [], scope: { [a.outcome]: coverage(f, a.outcome) } };
    }
    const factors: (typeof FACTOR_CANDIDATES)[number][] = [...FACTOR_CANDIDATES, ...(a.habitIds ?? []).map((id) => ({ key: `habit:${id}`, mode: "binary" as const, lags: [0, 1] }))];
    const results = [];
    for (const fac of factors) {
      if (fac.key === a.outcome) continue;
      if (a.outcome === "exercised" && fac.key.startsWith("habit:")) continue;
      for (const lag of fac.lags) {
        const r = compareCondition(f, { key: fac.key, mode: fac.mode, threshold: fac.threshold, lag }, a.outcome, (k) => (k === "isWeekend" ? { ...env.lookup("journal"), key: "isWeekend", label: "סוף שבוע", phrase: "סוף השבוע", format: "binary" } : env.lookup(k)), ["sleep_hours", "exercised", "meetings", "work_hours"]);
        if (r && r.comparison.d != null) results.push(r);
      }
    }
    results.sort((x, y) => Math.abs(y.comparison.d ?? 0) - Math.abs(x.comparison.d ?? 0));
    const facts: ToolOutput["facts"] = [];
    const evidence: EvidenceBlock[] = [];
    const considered = results.length;
    const meaningful = results.filter((r) => r.confidence.level !== "insufficient" && describeEffect(r.comparison.d) !== "none").slice(0, 5);
    if (!meaningful.length) {
      facts.push({ kind: "fact", text: `לא נמצא גורם שקשור בבירור ל${out.label} ${formatRange(a.from, a.to)} (נבדקו ${considered} השוואות; ${f.filter((r) => r.v[a.outcome] != null).length} ימים עם נתונים על ${out.label}).` });
    }
    for (const r of meaningful) {
      facts.push({
        kind: "pattern",
        text: `${r.labels[0]}: ${aggregateNoun(out)} ${formatFieldValue(out, r.comparison.a.mean)} (${r.comparison.a.n} ימים), לעומת ${formatFieldValue(out, r.comparison.b.mean)} ${r.labels[1]} (${r.comparison.b.n} ימים). הפרש ${diffText(out, r.comparison)}, גודל אפקט ${EFFECT_LABEL[describeEffect(r.comparison.d)]}. ${r.confidence.reason}${r.confounders.length ? ` שים לב: באותם ימים נמדדו גם הבדלים ב־${r.confounders.map((c) => `${c.label} (${c.a} מול ${c.b})`).join(", ")}.` : ""}${r.condition.lag === 1 ? " (הגורם נמדד ביום הקודם.)" : ""}`,
      });
      evidence.push(...conditionEvidence(r, env.lookup, [a.from, a.to]).slice(0, 1));
    }
    if (meaningful[0]) {
      const cv = conditionCaveats(meaningful[0]);
      facts.push({ kind: "fact", text: `הסתייגות: ${cv.join(" ")}` });
    }
    return { tool: this.name, title: `מה קשור ל${out.label}`, facts, evidence, scope: { [a.outcome]: f.filter((r) => r.v[a.outcome] != null).length, factorsTested: considered } };
  },
};

const get_habits: ToolDef<{ habitIds?: string[] }> = {
  name: "get_habits",
  description: "Current habits with schedule, today's status, streaks, this week's progress and 7/30/90-day completion rates.",
  args: z.object({ habitIds: z.array(z.string()).optional() }),
  async run(env, a) {
    const all = await habitSummaries(env.ctx);
    const list = a.habitIds?.length ? all.filter((s) => a.habitIds!.includes(s.habit.id)) : all;
    const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
    const facts: ToolOutput["facts"] = list.map((s) => ({
      kind: "metric" as const,
      text: `„${s.habit.name}” (${s.habit.tier === "main" ? "פעילות מתוכננת" : "הרגל יומי"}; ${scheduleText(s.habit)}): השבוע ${fmtNum(s.week.done)} מתוך ${s.week.expected}; השלמה ב־7 ימים ${pct(s.rate7)}, ב־30 ימים ${pct(s.rate30)}, ב־90 ימים ${pct(s.rate90)}; רצף נוכחי ${s.streak.current} ${s.streak.unit === "weeks" ? "שבועות" : "ימים"} (שיא ${s.streak.best}).`,
    }));
    if (!list.length) facts.push({ kind: "fact", text: "עדיין לא הוגדרו הרגלים." });
    return {
      tool: this.name,
      title: "הרגלים",
      facts,
      evidence: [
        {
          kind: "table",
          label: "השלמת הרגלים",
          data: { columns: ["הרגל", "7 ימים", "30 ימים", "90 ימים", "רצף"], rows: list.map((s) => [s.habit.name, pct(s.rate7), pct(s.rate30), pct(s.rate90), String(s.streak.current)]) },
        },
      ],
      scope: { habits: list.length },
    };
  },
};

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function scheduleText(h: { frequency: string; scheduleDays: number[] | null; weeklyTarget: number | null; timeLabel: string | null }) {
  if (h.frequency === "daily") return `כל יום${h.timeLabel ? `, ${h.timeLabel}` : ""}`;
  if (h.frequency === "weekly_count") return `${h.weeklyTarget ?? 1} פעמים בשבוע`;
  return `בימי ${(h.scheduleDays ?? []).map((d) => WEEKDAY_NAMES[d]).join(", ")}${h.timeLabel ? `, ${h.timeLabel}` : ""}`;
}

const get_habit_history: ToolDef<{ habitId: string; from: ISODate; to: ISODate }> = {
  name: "get_habit_history",
  description: "History of one habit: weekly completion, weekday pattern, longest gap, last full week without it.",
  args: z.object({ habitId: z.string(), from: z.string(), to: z.string() }),
  async run(env, a) {
    const key = `habit:${a.habitId}`;
    const name = env.habitNames.get(a.habitId) ?? "ההרגל";
    const f = inRange(env.frame, a.from, a.to);
    const weeks = weeklyMeans(f, [key]).filter((w) => w.values[key] != null);
    const facts: ToolOutput["facts"] = [];
    if (!weeks.length) {
      facts.push({ kind: "fact", text: `אין היסטוריה עבור „${name}” ${formatRange(a.from, a.to)}.` });
      return { tool: this.name, title: name, facts, evidence: [], scope: { [key]: 0 } };
    }
    const dow = dayOfWeek(f, key).filter((d) => d.n >= 2 && d.mean != null);
    const done = f.filter((r) => (r.v[key] ?? 0) > 0);
    const lastDone = done.length ? done[done.length - 1].date : null;
    // Longest stretch of scheduled days without completion.
    let gap = 0;
    let best = { len: 0, end: "" };
    for (const r of f) {
      const v = r.v[key];
      if (v == null) continue;
      if (v > 0) gap = 0;
      else if (++gap > best.len) best = { len: gap, end: r.date };
    }
    const zeroWeeks = weeks.filter((w) => (w.values[key] ?? 0) === 0);
    facts.push({ kind: "metric", text: `„${name}” ${formatRange(a.from, a.to)}: הושלם ב־${done.length} ימים מתוך ${f.filter((r) => r.v[key] != null).length} ימים שבהם היה מתוכנן.` });
    if (lastDone) facts.push({ kind: "fact", text: `הפעם האחרונה ש„${name}” הושלם: ${formatDate(lastDone, { year: true })}.` });
    if (best.len >= 2) facts.push({ kind: "fact", text: `הרצף הארוך ביותר בלי „${name}”: ${best.len} פעמים מתוכננות ברציפות, עד ${formatDate(best.end, { year: true })}.` });
    if (zeroWeeks.length) {
      const last = zeroWeeks[zeroWeeks.length - 1];
      facts.push({ kind: "fact", text: `השבוע המלא האחרון שבו „${name}” לא הושלם בכלל: השבוע שהתחיל ב־${formatDate(last.weekStart, { year: true })} (${zeroWeeks.length} שבועות כאלה בתקופה).` });
    } else facts.push({ kind: "fact", text: `בתקופה הזו לא היה שבוע שלם בלי „${name}”.` });
    if (dow.length >= 3) {
      const sorted = [...dow].sort((x, y) => (y.mean ?? 0) - (x.mean ?? 0));
      facts.push({ kind: "pattern", text: `לפי ימים: הכי עקבי בימי ${sorted[0].name} (${Math.round((sorted[0].mean ?? 0) * 100)}%), הכי פחות בימי ${sorted[sorted.length - 1].name} (${Math.round((sorted[sorted.length - 1].mean ?? 0) * 100)}%).` });
    }
    return {
      tool: this.name,
      title: `היסטוריה: ${name}`,
      facts,
      evidence: [{ kind: "series", label: `„${name}” — שיעור השלמה שבועי`, data: { format: "binary", points: weeks.map((w) => ({ x: w.weekStart, y: w.values[key] })) } }],
      scope: { [key]: f.length },
    };
  },
};

const get_goals: ToolDef<Record<string, never>> = {
  name: "get_goals",
  description: "Active goals with progress, deadline, expected-by-now progress and linked habit consistency.",
  args: z.object({}) as unknown as z.ZodType<Record<string, never>>,
  async run(env) {
    const goals = (await listGoals(env.ctx)).filter((g) => g.goal.status === "active" || g.goal.status === "paused");
    const facts: ToolOutput["facts"] = goals.map((g) => ({
      kind: "metric" as const,
      text: `מטרה „${g.goal.title}”: ${g.progressLabel}${g.progress != null ? ` (${Math.round(g.progress * 100)}%)` : ""}${g.goal.deadline ? `; דדליין ${formatDate(g.goal.deadline, { year: true })} (${g.daysLeft} ימים)` : ""}${g.expectedProgress != null ? `; לפי קו ישר היה צפוי ${Math.round(g.expectedProgress * 100)}% עד היום` : ""}${g.habitConsistency != null ? `; עקביות ההרגלים הקשורים ב־30 יום: ${Math.round(g.habitConsistency * 100)}%` : ""}.`,
    }));
    if (!goals.length) facts.push({ kind: "fact", text: "אין מטרות פעילות." });
    return { tool: this.name, title: "מטרות", facts, evidence: [], scope: { goals: goals.length } };
  },
};

const get_checkins: ToolDef<{ from: ISODate; to: ISODate; includeNotes?: boolean }> = {
  name: "get_checkins",
  description: "Daily check-ins (mood/energy/focus 1–10, highlights, tags) for a range; notes only when allowed by privacy settings.",
  args: z.object({ from: z.string(), to: z.string(), includeNotes: z.boolean().optional() }),
  async run(env, a) {
    const rows = await listCheckins(env.ctx, a.from, a.to);
    const facts: ToolOutput["facts"] = [];
    const texts: ToolOutput["texts"] = [];
    facts.push({ kind: "fact", text: `צ׳ק־אין מולא ב־${rows.length} ימים ${formatRange(a.from, a.to)}.` });
    const tagCounts = new Map<string, number>();
    rows.forEach((r) => r.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
    if (tagCounts.size)
      facts.push({ kind: "metric", text: `תגיות נפוצות: ${[...tagCounts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([t, c]) => `${t} (${c})`).join(", ")}.` });
    const highlights = rows.filter((r) => r.highlight).slice(0, 12);
    for (const h of highlights) facts.push({ kind: "fact", text: `${formatDate(h.date)}: אירוע חשוב — ${h.highlight}` });
    if (env.ctx.settings.ai.shareJournalText && a.includeNotes !== false) {
      for (const r of rows.filter((r) => r.note).slice(0, 15)) texts.push({ date: r.date, text: r.note!.slice(0, 400) });
    }
    return { tool: this.name, title: "צ׳ק־אין", facts, evidence: [], texts, scope: { checkins: rows.length, checkinNotes: texts.length } };
  },
};

const get_journal_entries: ToolDef<{ from: ISODate; to: ISODate; query?: string }> = {
  name: "get_journal_entries",
  description: "Journal entries in a range, optionally filtered by keywords. Text is only included when the user allows it.",
  args: z.object({ from: z.string(), to: z.string(), query: z.string().optional() }),
  async run(env, a) {
    let rows = await listJournal(env.ctx, { from: a.from, to: a.to, q: a.query, limit: 20 });
    if (!rows.length && a.query) rows = await listJournal(env.ctx, { from: a.from, to: a.to, limit: 10 });
    const facts: ToolOutput["facts"] = [{ kind: "fact", text: `נמצאו ${rows.length} רשומות יומן רלוונטיות ${formatRange(a.from, a.to)}.` }];
    const important = rows.filter((r) => r.important);
    for (const r of important.slice(0, 5)) facts.push({ kind: "fact", text: `${formatDate(r.date)}: סומן כאירוע חשוב — ${r.title ?? r.body.slice(0, 80)}` });
    const texts = env.ctx.settings.ai.shareJournalText ? rows.slice(0, 12).map((r) => ({ date: r.date, text: `${r.title ? `${r.title}: ` : ""}${r.body}`.slice(0, 600) })) : [];
    if (!env.ctx.settings.ai.shareJournalText) facts.push({ kind: "fact", text: "תוכן היומן לא נשלח ל־AI לפי הגדרות הפרטיות." });
    return { tool: this.name, title: "יומן", facts, evidence: [], texts, scope: { journalEntries: texts.length } };
  },
};

const get_spending: ToolDef<{ from: ISODate; to: ISODate; category?: string }> = {
  name: "get_spending",
  description: "Spending totals by category for a range, daily average, and (only if allowed) the largest individual transactions.",
  args: z.object({ from: z.string(), to: z.string(), category: z.string().optional() }),
  async run(env, a) {
    const cats = await spendingByCategory(env.ctx, a.from, a.to);
    const total = cats.reduce((s, c) => s + c.total, 0);
    const days = diffDays(a.to, a.from) + 1;
    const facts: ToolOutput["facts"] = [];
    if (!cats.length) facts.push({ kind: "fact", text: `לא נרשמו הוצאות ${formatRange(a.from, a.to)}.` });
    else {
      facts.push({ kind: "metric", text: `סך ההוצאות ${formatRange(a.from, a.to)}: ${formatCurrency(total)} ב־${cats.reduce((s, c) => s + c.count, 0)} עסקאות (ממוצע ${formatCurrency(total / days)} ליום).` });
      facts.push({ kind: "metric", text: `לפי קטגוריה: ${cats.map((c) => `${SPENDING_LABEL.get(c.category) ?? c.category} ${formatCurrency(c.total)} (${c.count})`).join(", ")}.` });
    }
    if (a.category) {
      const c = cats.find((x) => x.category === a.category);
      facts.push({ kind: "metric", text: `${SPENDING_LABEL.get(a.category) ?? a.category} ${formatRange(a.from, a.to)}: ${formatCurrency(c?.total ?? 0)} ב־${c?.count ?? 0} עסקאות.` });
    }
    let txCount = 0;
    if (env.ctx.settings.ai.shareTransactions) {
      const tx = (await listTransactions(env.ctx, { from: a.from, to: a.to, category: a.category, limit: 200 })).sort((x, y) => y.amount - x.amount).slice(0, 8);
      txCount = tx.length;
      for (const t of tx) facts.push({ kind: "fact", text: `${formatDate(t.date)}: ${formatCurrency(t.amount)} — ${t.merchant ?? t.description ?? SPENDING_LABEL.get(t.category) ?? t.category}` });
    }
    return {
      tool: this.name,
      title: "הוצאות",
      facts,
      evidence: cats.length ? [{ kind: "table", label: "הוצאות לפי קטגוריה", data: { columns: ["קטגוריה", "סכום", "עסקאות"], rows: cats.map((c) => [SPENDING_LABEL.get(c.category) ?? c.category, formatCurrency(c.total), String(c.count)]) } }] : [],
      scope: { spendingCategories: cats.length, transactions: txCount },
    };
  },
};

const get_calendar_load: ToolDef<{ from: ISODate; to: ISODate }> = {
  name: "get_calendar_load",
  description: "Calendar load: meetings and busy hours per week, busiest days, upcoming events.",
  args: z.object({ from: z.string(), to: z.string() }),
  async run(env, a) {
    const f = inRange(env.frame, a.from, a.to);
    const facts: ToolOutput["facts"] = [];
    if (coverage(f, "meetings") === 0) {
      facts.push({ kind: "fact", text: "אין נתוני יומן פגישות לתקופה הזו (לא מחובר יומן או שלא נרשמו אירועים)." });
      return { tool: this.name, title: "עומס ביומן", facts, evidence: [], scope: { calendarDays: 0 } };
    }
    const weeks = weeklyMeans(f, ["meetings", "calendar_hours"]);
    facts.push({
      kind: "metric",
      text: `ממוצע פגישות ליום לפי שבוע: ${weeks.map((w) => `${formatDate(w.weekStart, { short: true })}: ${(w.values.meetings ?? 0).toFixed(1)}`).join("; ")}.`,
    });
    const top = [...f].filter((r) => r.v.meetings != null).sort((x, y) => (y.v.calendar_hours ?? 0) - (x.v.calendar_hours ?? 0)).slice(0, 3);
    facts.push({ kind: "fact", text: `הימים העמוסים ביותר: ${top.map((r) => `${formatDate(r.date)} (${r.v.meetings} אירועים, ${formatFieldValue(env.lookup("calendar_hours"), r.v.calendar_hours)})`).join(", ")}.` });
    return { tool: this.name, title: "עומס ביומן", facts, evidence: [seriesEvidence(f, "meetings", env.lookup("meetings"), "פגישות ביום")], scope: { calendarDays: coverage(f, "meetings") } };
  },
};

const get_upcoming: ToolDef<{ days: number }> = {
  name: "get_upcoming",
  description: "Upcoming calendar events for the next N days (titles and times).",
  args: z.object({ days: z.number().int().min(1).max(14) }),
  async run(env, a) {
    const from = zonedTime(env.ctx.today, "00:00", env.ctx.timezone);
    const to = zonedTime(addDays(env.ctx.today, a.days), "00:00", env.ctx.timezone);
    const events = await listCalendar(env.ctx, from, to);
    const fmt = new Intl.DateTimeFormat("he-IL", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: env.ctx.timezone });
    const facts: ToolOutput["facts"] = events.slice(0, 20).map((e) => ({ kind: "fact" as const, text: `${e.allDay ? "כל היום" : fmt.format(e.startAt)}: ${e.title}` }));
    if (!events.length) facts.push({ kind: "fact", text: "אין אירועים ביומן בימים הקרובים." });
    return { tool: this.name, title: "ביומן", facts, evidence: [], scope: { calendarEvents: events.length } };
  },
};

const search_personal_memory: ToolDef<{ query: string }> = {
  name: "search_personal_memory",
  description: "Search the user's confirmed long-term memory (facts, preferences, goals, important events, patterns).",
  args: z.object({ query: z.string() }),
  async run(env, a) {
    const mem = await searchMemories(env.ctx, a.query, 12);
    const facts: ToolOutput["facts"] = mem.map((m) => ({ kind: "fact" as const, text: `זיכרון (${m.kind}${m.source === "user" ? ", נאמר על ידי המשתמש" : ", אושר על ידי המשתמש"}): ${m.content}` }));
    return { tool: this.name, title: "זיכרון אישי", facts, evidence: [], scope: { memories: mem.length } };
  },
};

const get_insights: ToolDef<{ limit?: number }> = {
  name: "get_insights",
  description: "The strongest current automatically-discovered patterns (already computed with evidence and confidence).",
  args: z.object({ limit: z.number().int().min(1).max(10).optional() }),
  async run(env, a) {
    const rows = await listInsights(env.ctx, { limit: a.limit ?? 6 });
    const facts: ToolOutput["facts"] = rows.map((i) => ({ kind: "pattern" as const, text: `${i.title}: ${i.summary} (${i.confidenceReason ?? ""})` }));
    return { tool: this.name, title: "תובנות קיימות", facts, evidence: [], scope: { insights: rows.length } };
  },
};

const compare_best_weeks: ToolDef<{ outcome: string; from: ISODate; to: ISODate }> = {
  name: "compare_best_weeks",
  description: "Rank weeks by an outcome and compare the best weeks with the rest across all other signals.",
  args: z.object({ outcome: z.string(), from: z.string(), to: z.string() }),
  async run(env, a) {
    const f = inRange(env.frame, a.from, a.to);
    const keys = ["habit_rate", "main_habit_rate", "mood", "energy", "focus", "sleep_hours", "bedtime", "exercised", "steps", "meetings", "work_hours", "spending", "screen_time_hours"].filter((k) => coverage(f, k) >= 7);
    const weeks = weeklyMeans(f, keys).filter((w) => w.days >= 5 && w.values[a.outcome] != null);
    const out = env.lookup(a.outcome);
    if (weeks.length < 5) {
      return { tool: this.name, title: "השבועות הטובים", facts: [{ kind: "fact", text: `יש רק ${weeks.length} שבועות עם נתונים על ${out.label} — מעט מדי להשוואה.` }], evidence: [], scope: { weeks: weeks.length } };
    }
    const sorted = [...weeks].sort((x, y) => (y.values[a.outcome] ?? 0) - (x.values[a.outcome] ?? 0));
    const k = Math.max(2, Math.round(weeks.length / 4));
    const best = sorted.slice(0, k);
    const rest = sorted.slice(k);
    const avg = (ws: typeof weeks, key: string) => {
      const v = ws.map((w) => w.values[key]).filter((x): x is number => x != null);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    };
    const facts: ToolOutput["facts"] = [
      { kind: "metric", text: `${k} השבועות הטובים ביותר לפי ${out.label}: ${best.map((w) => `${formatDate(w.weekStart, { short: true })} (${formatFieldValue(out, w.values[a.outcome])})`).join(", ")}; מתוך ${weeks.length} שבועות.` },
    ];
    const rows: string[][] = [];
    for (const key of keys) {
      if (key === a.outcome) continue;
      const info = env.lookup(key);
      const b = avg(best, key);
      const r = avg(rest, key);
      if (b == null || r == null) continue;
      rows.push([info.label, formatFieldValue(info, b), formatFieldValue(info, r)]);
      facts.push({ kind: "pattern", text: `${info.label}: בשבועות הטובים ${formatFieldValue(info, b)}, בשאר ${formatFieldValue(info, r)}.` });
    }
    return { tool: this.name, title: "מה היה שונה בשבועות הטובים", facts, evidence: [{ kind: "table", label: "השבועות הטובים מול השאר", data: { columns: ["נתון", "שבועות טובים", "שאר השבועות"], rows } }], scope: { weeks: weeks.length } };
  },
};

const get_week_rhythm: ToolDef<{ key: string; from: ISODate; to: ISODate }> = {
  name: "get_week_rhythm",
  description: "Average of a Day Frame key per weekday (Sunday–Saturday).",
  args: z.object({ key: z.string(), from: z.string(), to: z.string() }),
  async run(env, a) {
    const f = inRange(env.frame, a.from, a.to);
    const info = env.lookup(a.key);
    if (coverage(f, a.key) === 0) return { tool: this.name, title: info.label, facts: [{ kind: "fact", text: `אין נתונים על ${info.label} ${formatRange(a.from, a.to)}.` }], evidence: [], scope: { [a.key]: 0 } };
    const dow = dayOfWeek(f, a.key);
    const facts: ToolOutput["facts"] = [{ kind: "metric", text: `${info.label} לפי יום בשבוע: ${dow.map((d) => `${d.name} ${formatFieldValue(info, d.mean)} (${d.n})`).join(", ")}.` }];
    return { tool: this.name, title: `${info.label} לפי ימים`, facts, evidence: [{ kind: "table", label: `${info.label} לפי יום`, data: { columns: ["יום", "ממוצע", "ימים"], rows: dow.map((d) => [d.name, formatFieldValue(info, d.mean), String(d.n)]) } }], scope: { [a.key]: coverage(f, a.key) } };
  },
};

const get_timeline: ToolDef<{ from: ISODate; to: ISODate }> = {
  name: "get_timeline",
  description: "Day-by-day summary lines for a short range (max 14 days).",
  args: z.object({ from: z.string(), to: z.string() }),
  async run(env, a) {
    const from = diffDays(a.to, a.from) > 13 ? addDays(a.to, -13) : a.from;
    const f = inRange(env.frame, from, a.to);
    const keys = ["sleep_hours", "exercised", "habit_rate", "mood", "energy", "focus", "work_hours", "meetings", "steps", "spending"];
    const facts: ToolOutput["facts"] = f.map((r) => ({
      kind: "fact" as const,
      text: `${formatDate(r.date)} (${WEEKDAY_NAMES[r.weekday]}): ${keys
        .filter((k) => r.v[k] != null)
        .map((k) => `${env.lookup(k).label} ${formatFieldValue(env.lookup(k), r.v[k])}`)
        .join(", ") || "אין נתונים"}`,
    }));
    return { tool: this.name, title: "ציר זמן", facts, evidence: [], scope: { days: f.length } };
  },
};

export const TOOLS = {
  get_metric_summary,
  compare_periods,
  find_relationships,
  get_habits,
  get_habit_history,
  get_goals,
  get_checkins,
  get_journal_entries,
  get_spending,
  get_calendar_load,
  get_upcoming,
  search_personal_memory,
  get_insights,
  compare_best_weeks,
  get_week_rhythm,
  get_timeline,
} as const;

export type ToolName = keyof typeof TOOLS;

export interface ToolCall {
  name: ToolName;
  args: unknown;
}

export async function runTool(env: ToolEnv, call: ToolCall): Promise<ToolOutput> {
  const def = TOOLS[call.name] as ToolDef<unknown>;
  const args = def.args.parse(call.args);
  return def.run(env, args);
}

export function toolCatalog(): string {
  return Object.values(TOOLS)
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
}

/** Used by search_personal_memory callers without a query. */
export { searchTerms, startOfWeek };
