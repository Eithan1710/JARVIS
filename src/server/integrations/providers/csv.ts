import "server-only";
import { isValidISODate, type ISODate } from "@/lib/dates";
import { SPENDING_CATEGORIES } from "@/lib/metrics";
import type { IntegrationDefinition, NormalizedRecord } from "../types";

export const csvImport: IntegrationDefinition = {
  id: "csv",
  name: "ייבוא קובץ CSV",
  description: "מדדים (שינה, צעדים, משקל…) או הוצאות מקובץ — למשל ייצוא מהבנק או מאפליקציה אחרת.",
  category: "files",
  auth: "file",
  dataTypes: ["מדדים", "הוצאות"],
  status: "available",
  fields: [],
  setupSteps: [
    "מדדים: עמודות date, metric, value (למשל 2026-09-28, sleep_hours, 7.5).",
    "הוצאות: עמודות תאריך, סכום, ולא חובה — קטגוריה, תיאור, בית עסק. מתאים לייצוא מרוב הבנקים וחברות האשראי.",
    "תאריכים נתמכים: 2026-09-28, 28/09/2026, 28.09.2026.",
  ],
};

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  const delim = (s.split("\n")[0].match(/;/g)?.length ?? 0) > (s.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : s.split("\n")[0].includes("\t") ? "\t" : ",";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export function parseFlexibleDate(s: string): ISODate | null {
  const t = s.trim();
  if (isValidISODate(t.slice(0, 10))) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  const iso = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isValidISODate(iso) ? iso : null;
}

export function parseAmount(s: string): number | null {
  const cleaned = s.replace(/[₪$€\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const neg = /^\(.*\)$/.test(cleaned) || cleaned.endsWith("-");
  const n = Number(cleaned.replace(/[()-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const H = (row: string[]) => row.map((h) => h.toLowerCase().replace(/["']/g, "").trim());
const find = (hdr: string[], names: string[]) => hdr.findIndex((h) => names.some((n) => h === n || h.includes(n)));

const CATEGORY_HINTS: [string, RegExp][] = [
  ["restaurants", /מסעד|קפה|פיצ|בורגר|סושי|wolt|וולט|תן ביס|10bis|ארומה|cafe|restaurant/i],
  ["groceries", /שופרסל|רמי לוי|יוחננוף|ויקטורי|מגה|טיב טעם|סופר|am:pm|יינות ביתן|אושר עד|carrefour|קרפור/i],
  ["transport", /רב.?קו|רכבת|דלק|פז|סונול|דור אלון|ten|yellow|גט|gett|uber|מונית|חניה|פנגו|cellopark/i],
  ["bills", /חשמל|מים|ארנונה|סלקום|פרטנר|בזק|הוט|yes|גז|ביטוח/i],
  ["health", /סופר.?פארם|בית מרקחת|מכבי|כללית|מאוחדת|לאומית|רופא/i],
  ["fitness", /הולמס|holmes|גו אקטיב|go active|כושר|gym|hevy/i],
  ["entertainment", /סינמה|קולנוע|yes planet|netflix|spotify|כרטיס|הופעה/i],
  ["travel", /מלון|booking|airbnb|אל על|elal|טיסה|ryanair|wizz/i],
  ["shopping", /amazon|aliexpress|שיין|shein|זארה|zara|h&m|איקאה|ikea|ksp|באג/i],
];

export function guessCategory(text: string): string {
  for (const [cat, re] of CATEGORY_HINTS) if (re.test(text)) return cat;
  return "other";
}

export function csvToRecords(kind: "metrics" | "transactions", text: string): { records: NormalizedRecord[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length < 2) return { records: [], errors: ["הקובץ ריק או שחסרה שורת כותרות."] };
  const hdr = H(rows[0]);
  const records: NormalizedRecord[] = [];

  if (kind === "metrics") {
    const di = find(hdr, ["date", "תאריך"]);
    const mi = find(hdr, ["metric", "מדד", "type", "key"]);
    const vi = find(hdr, ["value", "ערך", "qty"]);
    const ni = find(hdr, ["note", "הערה"]);
    if (di < 0 || mi < 0 || vi < 0) return { records, errors: ["חסרות עמודות: date, metric, value."] };
    rows.slice(1).forEach((r, i) => {
      const date = parseFlexibleDate(r[di] ?? "");
      const key = (r[mi] ?? "").trim();
      const value = parseAmount(r[vi] ?? "");
      if (!date || !/^[a-z][a-z0-9_]{1,40}$/.test(key) || value == null) {
        errors.push(`שורה ${i + 2}: ערך לא תקין`);
        return;
      }
      records.push({ externalId: `csv|${key}|${date}|${i}`, recordType: key, raw: Object.fromEntries(hdr.map((h, j) => [h, r[j]])), outputs: [{ type: "metric", metricKey: key, value, date, note: ni >= 0 ? r[ni] || null : null }] });
    });
  } else {
    const di = find(hdr, ["date", "תאריך"]);
    const ai = find(hdr, ["amount", "סכום", "חיוב", "debit", "סכום חיוב"]);
    const ci = find(hdr, ["category", "קטגוריה", "ענף"]);
    const desc = find(hdr, ["description", "תיאור", "פירוט"]);
    const mi = find(hdr, ["merchant", "בית עסק", "שם בית העסק", "payee"]);
    if (di < 0 || ai < 0) return { records, errors: ["חסרות עמודות: תאריך וסכום."] };
    const known = new Set(SPENDING_CATEGORIES.map((c) => c.key));
    rows.slice(1).forEach((r, i) => {
      const date = parseFlexibleDate(r[di] ?? "");
      const amount = parseAmount(r[ai] ?? "");
      if (!date || amount == null || amount === 0) {
        errors.push(`שורה ${i + 2}: תאריך או סכום לא תקינים`);
        return;
      }
      const merchant = mi >= 0 ? r[mi] || null : null;
      const description = desc >= 0 ? r[desc] || null : null;
      const rawCat = ci >= 0 ? (r[ci] ?? "").trim() : "";
      const category = known.has(rawCat) ? rawCat : SPENDING_CATEGORIES.find((c) => c.label === rawCat)?.key ?? guessCategory(`${merchant ?? ""} ${description ?? ""} ${rawCat}`);
      records.push({
        externalId: `csv|tx|${date}|${amount}|${merchant ?? description ?? ""}|${i}`,
        recordType: "transaction",
        raw: Object.fromEntries(hdr.map((h, j) => [h, r[j]])),
        outputs: [{ type: "transaction", date, amount: Math.abs(amount), category, description, merchant }],
      });
    });
  }
  return { records, errors: errors.slice(0, 20) };
}
