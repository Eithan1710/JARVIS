/**
 * Step 1 of the orchestrator: deterministic intent understanding for Hebrew questions.
 * Fast, free and predictable. An LLM planner is only consulted when this finds nothing.
 */
import { addDays, startOfMonth, startOfWeek, addMonths, endOfMonth, type ISODate } from "@/lib/dates";
import { SPENDING_CATEGORIES } from "@/lib/metrics";

export type Domain =
  | "sleep"
  | "exercise"
  | "mood"
  | "energy"
  | "focus"
  | "habits"
  | "goals"
  | "spending"
  | "work"
  | "journal"
  | "steps"
  | "weight"
  | "learning"
  | "memory";

export type QuestionType = "explain" | "when" | "aggregate" | "change" | "relationship" | "discovery" | "lookup" | "general";

export interface Intent {
  domains: Domain[];
  type: QuestionType;
  range: { from: ISODate; to: ISODate; label: string; explicit: boolean };
  /** For change questions: the period to compare against. */
  baseline?: { from: ISODate; to: ISODate; label: string };
  habitIds: string[];
  spendingCategory?: string;
}

const DOMAIN_PATTERNS: [Domain, RegExp][] = [
  ["sleep", /שינה|ישנתי|לישון|נרדמ|הירדמות|התעורר|עייפ|לילה/],
  ["exercise", /אימונ|אימון|התאמנ|כושר|ריצה|רץ |רצתי|ספורט|חדר כושר|סלסה|ריקוד|workout|gym|hevy/i],
  ["mood", /מצב רוח|מצב הרוח|מרגיש|הרגשתי|שמח|עצוב|מדוכדך|לחוץ|לחץ|סטרס/],
  ["energy", /אנרגי|עייפות|כוח|חיוני/],
  ["focus", /ריכוז|מרוכז|פוקוס|פרודוקטיב|ממוקד|יעיל|תפוקה|דחיינות/],
  ["habits", /הרגל|עקבי|עקביות|רצף|רצפים|השלמתי|פספסתי|החמצתי|streak/i],
  ["goals", /מטר[הות]|יעד|יעדים|להשיג|התקדמות/],
  ["spending", /הוצא|הוצאתי|כסף|שילמתי|מסעד|קניות|₪|שקל|תקציב|בזבז|קפה/],
  ["work", /עבוד|עבדתי|פגיש|ישיב|עומס|יומן פגישות|מיילים|משמרת|שעות עבודה/],
  ["journal", /כתבתי|ביומן|רשמתי|יומן אישי|תיעדתי/],
  ["steps", /צעדים|הליכה|הלכתי/],
  ["weight", /משקל|שקלתי|קילו|ק"ג|ק״ג|הרכב גוף/],
  ["learning", /למיד|למדתי|לימוד|קורס|קריאה|קראתי|ספר/],
  ["memory", /זוכר|זכור|העדפ|מה אתה יודע עליי|מה ידוע/],
];

const TYPE_PATTERNS: [QuestionType, RegExp][] = [
  ["relationship", /קשר|משפיע|השפעה|קשור|מתאם|תלוי|ככל ש/],
  ["explain", /למה|מדוע|מה גורם|מה הסיבה|איך זה ש|מה מונע|מה עוזר/],
  ["discovery", /דפוס|שמת לב|מעניין|מה אתה רואה|מה בולט|תגלה|לחקור|מה כדאי לי לבדוק|שבועות הטובים|הימים הטובים|הכי טוב|היה שונה/],
  ["change", /השתנה|שינוי|לעומת|בהשוואה|השוואה|ירד|עלה|יותר מאשר|פחות מאשר|מגמה/],
  ["when", /מתי|באיזו שעה|באיזה יום|הפעם האחרונה/],
  ["aggregate", /כמה|סך הכל|סה"כ|ממוצע|בממוצע|אחוז/],
];

const HEB_NUM: Record<string, number> = {
  אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2, שלושה: 3, שלוש: 3, ארבעה: 4, ארבע: 4, חמישה: 5, חמש: 5, שישה: 6, שש: 6,
  שבעה: 7, שבע: 7, שמונה: 8, תשעה: 9, תשע: 9, עשרה: 10, עשר: 10, שנים: 12,
};

function parseCount(s: string | undefined): number | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return HEB_NUM[s] ?? null;
}

export function detectRange(q: string, today: ISODate, type: QuestionType): Intent["range"] & { baseline?: Intent["baseline"] } {
  const r = (from: ISODate, to: ISODate, label: string) => ({ from, to, label, explicit: true });
  if (/היום/.test(q) && !/היומי/.test(q)) return r(today, today, "היום");
  if (/אתמול/.test(q)) return r(addDays(today, -1), addDays(today, -1), "אתמול");
  if (/שבוע שעבר|השבוע הקודם|בשבוע שעבר/.test(q)) {
    const ws = addDays(startOfWeek(today), -7);
    return r(ws, addDays(ws, 6), "בשבוע שעבר");
  }
  if (/השבוע/.test(q)) return r(startOfWeek(today), today, "השבוע");
  if (/חודש שעבר|החודש הקודם|בחודש שעבר/.test(q)) {
    const ms = startOfMonth(addMonths(today, -1));
    return r(ms, endOfMonth(ms), "בחודש שעבר");
  }
  if (/החודש/.test(q)) return r(startOfMonth(today), today, "החודש");
  if (/השנה/.test(q)) return r(`${today.slice(0, 4)}-01-01`, today, "השנה");
  if (/חצי שנה/.test(q)) return r(addMonths(today, -6), today, "בחצי השנה האחרונה");
  if (/שבועיים/.test(q)) return r(addDays(today, -13), today, "בשבועיים האחרונים");
  if (/חודשיים/.test(q)) return r(addMonths(today, -2), today, "בחודשיים האחרונים");

  const m = q.match(/(\d+|[א-ת]+)\s+(ימים|יום|שבועות|שבוע|חודשים|חודש|שנים|שנה)/);
  const n = parseCount(m?.[1]);
  if (m && n) {
    const unit = m[2];
    const from = unit.startsWith("י") ? addDays(today, -(n - 1)) : unit.startsWith("ש") && unit !== "שנה" && unit !== "שנים" ? addDays(today, -(n * 7 - 1)) : unit.startsWith("ח") ? addMonths(today, -n) : addMonths(today, -12 * n);
    return r(from, today, `ב־${m[1]} ${unit} האחרונים`);
  }

  // Defaults per question type (not explicit).
  const d = (days: number, label: string) => ({ from: addDays(today, -(days - 1)), to: today, label, explicit: false });
  switch (type) {
    case "discovery":
    case "relationship":
      return d(120, "ב־4 החודשים האחרונים");
    case "when":
      return d(365, "בשנה האחרונה");
    case "aggregate":
      return d(30, "ב־30 הימים האחרונים");
    default:
      return d(60, "בחודשיים האחרונים");
  }
}

function normalize(s: string) {
  return s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function detectIntent(q: string, today: ISODate, habits: { id: string; name: string }[]): Intent {
  const text = ` ${q} `;
  const domains = DOMAIN_PATTERNS.filter(([, re]) => re.test(text)).map(([d]) => d);
  let type: QuestionType = "general";
  for (const [t, re] of TYPE_PATTERNS) {
    if (re.test(text)) {
      type = t;
      break;
    }
  }
  // "לאחרונה"/"פחות"/"יותר" with a why-question implies a change over time.
  const recentChange = /לאחרונה|בזמן האחרון|פחות|יותר/.test(text);

  const nq = normalize(q);
  const habitIds = habits
    .filter((h) => {
      const nh = normalize(h.name);
      if (!nh) return false;
      if (nq.includes(nh)) return true;
      // Match on the most distinctive word of the habit name (≥3 letters).
      return nh.split(" ").some((w) => w.length >= 3 && !/^\d/.test(w) && nq.includes(w));
    })
    .map((h) => h.id);
  if (habitIds.length && !domains.includes("habits")) domains.push("habits");

  const spendingCategory = /מסעד|בית קפה|קפה/.test(q)
    ? "restaurants"
    : SPENDING_CATEGORIES.find((c) => c.key !== "other" && q.includes(c.label.split(" ")[0]))?.key;

  const range = detectRange(q, today, type);
  let baseline: Intent["baseline"];
  if ((type === "explain" || type === "change") && recentChange && !range.explicit) {
    // "Why … less lately?" → compare the last 4 weeks with the 8 weeks before.
    range.from = addDays(today, -27);
    range.label = "בארבעת השבועות האחרונים";
    baseline = { from: addDays(today, -83), to: addDays(today, -28), label: "בשמונת השבועות שלפני" };
  } else if (type === "change") {
    const len = Math.max(7, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000) + 1);
    baseline = { from: addDays(range.from, -len), to: addDays(range.from, -1), label: "בתקופה המקבילה שלפני" };
  }

  return { domains, type, range, baseline, habitIds, spendingCategory };
}

/** Which Day Frame keys belong to each domain (used to pick outcome/factor keys). */
export const DOMAIN_KEYS: Record<Domain, string[]> = {
  sleep: ["sleep_hours", "bedtime"],
  exercise: ["exercised", "workout_minutes"],
  mood: ["mood"],
  energy: ["energy"],
  focus: ["focus", "deep_work_hours"],
  habits: ["habit_rate", "main_habit_rate", "side_habit_rate"],
  goals: [],
  spending: ["spending"],
  work: ["work_hours", "meetings", "calendar_hours"],
  journal: [],
  steps: ["steps"],
  weight: ["weight"],
  learning: ["study_minutes", "reading_minutes"],
  memory: [],
};
