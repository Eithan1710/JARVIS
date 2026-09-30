import "server-only";

const STOP = new Set(
  "של את על מה זה זו אני לי אתה את עם גם כל יש אם כי לא הוא היא הם או רק אבל אז איך למה מתי איפה מי שלי שלך אותי אותך היה היתה יהיה תגיד תזכיר תזכור ספר לי בבקשה עכשיו פעם דבר משהו the a an and or of to in on for is are was what when how why who me my you your i it this that".split(
    " ",
  ),
);

/** Search terms from free text (Hebrew or English): lower-cased, de-duplicated, stopwords removed. */
export function searchTerms(q: string, max = 6): string[] {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'"״׳-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^["'״׳-]+|["'״׳-]+$/g, ""))
    .filter((w) => w.length >= 2 && !STOP.has(w));
  // Hebrew attaches prefixes (ו, ה, ב, ל, מ, ש, כ); also search the stem so "בגיטהאב" finds "גיטהאב".
  const out: string[] = [];
  for (const w of words) {
    const stem = /^[והבלמשכ][֐-׿]{3,}$/.test(w) ? w.slice(1) : w;
    if (!out.includes(stem)) out.push(stem);
  }
  return out.slice(0, max);
}

/** Escape a term for use inside ILIKE '%…%'. */
export function likeEscape(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function scoreText(text: string, terms: string[]): number {
  const t = text.toLowerCase();
  return terms.reduce((s, term) => s + (t.includes(term) ? 1 : 0), 0);
}

export function clip(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Normalized key for de-duplicating short facts. */
export function normalizeFact(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
