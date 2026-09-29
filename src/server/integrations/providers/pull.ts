import "server-only";
import { addDays, toLocalDate } from "@/lib/dates";
import type { IntegrationDefinition, NormalizedRecord } from "../types";

/** Daily weather from Open-Meteo (free, no key). Useful as context for mood/energy/exercise. */
export const weather: IntegrationDefinition = {
  id: "weather",
  name: "מזג אוויר",
  description: "טמפרטורה ומשקעים יומיים לפי המיקום שלך (Open-Meteo, ללא מפתח).",
  category: "environment",
  auth: "location",
  dataTypes: ["טמפרטורה מרבית", "משקעים"],
  status: "available",
  fields: [
    { key: "name", label: "עיר", type: "text", placeholder: "תל אביב", required: true },
    { key: "latitude", label: "קו רוחב", type: "number", placeholder: "32.08", required: true, dir: "ltr" },
    { key: "longitude", label: "קו אורך", type: "number", placeholder: "34.78", required: true, dir: "ltr" },
  ],
  setupSteps: ["אפשר להשתמש בכפתור „המיקום שלי” כדי למלא את הקואורדינטות אוטומטית.", "הנתונים נשלפים פעם ביום, 30 יום אחורה."],
  async sync({ config, timezone, today }) {
    const lat = Number(config.latitude);
    const lon = Number(config.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("missing coordinates");
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum&timezone=${encodeURIComponent(timezone)}&past_days=30&forecast_days=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`weather fetch failed (${res.status})`);
    const data = (await res.json()) as { daily?: { time: string[]; temperature_2m_max: (number | null)[]; precipitation_sum: (number | null)[] } };
    const d = data.daily;
    if (!d) return [];
    const out: NormalizedRecord[] = [];
    d.time.forEach((date, i) => {
      if (date > today) return;
      const outputs: NormalizedRecord["outputs"] = [];
      const t = d.temperature_2m_max[i];
      const p = d.precipitation_sum[i];
      if (t != null) outputs.push({ type: "metric", metricKey: "temp_max", value: t, date });
      if (p != null) outputs.push({ type: "metric", metricKey: "precipitation_mm", value: p, date });
      if (outputs.length) out.push({ externalId: `weather|${date}`, recordType: "daily_weather", raw: { date, temperature_2m_max: t, precipitation_sum: p }, outputs });
    });
    return out;
  },
};

/** Commits per day from GitHub public events (or private too, with a token). */
export const github: IntegrationDefinition = {
  id: "github",
  name: "GitHub",
  description: "מספר הקומיטים ביום — אינדיקציה לעבודת פיתוח.",
  category: "work",
  auth: "token",
  dataTypes: ["קומיטים ביום"],
  status: "available",
  secretKeys: ["token"],
  fields: [
    { key: "username", label: "שם משתמש", type: "text", placeholder: "octocat", required: true, dir: "ltr" },
    { key: "token", label: "טוקן (לא חובה, לפעילות פרטית)", type: "secret", placeholder: "github_pat_…", dir: "ltr", help: "Fine-grained token עם הרשאת קריאה בלבד." },
  ],
  setupSteps: ["בלי טוקן נספרת רק פעילות ציבורית.", "GitHub שומר אירועים ל־90 יום אחורה בלבד, ולכן כדאי לחבר מוקדם."],
  async sync({ config, secrets, timezone, today }) {
    const username = String(config.username ?? "").trim();
    if (!/^[A-Za-z0-9-]{1,39}$/.test(username)) throw new Error("invalid username");
    const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "nova-personal-os" };
    if (secrets.token) headers.authorization = `Bearer ${secrets.token}`;
    const perDay = new Map<string, number>();
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`https://api.github.com/users/${username}/events?per_page=100&page=${page}`, { headers, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`github fetch failed (${res.status})`);
      const events = (await res.json()) as { type: string; created_at: string; payload?: { size?: number; commits?: unknown[] } }[];
      for (const e of events) {
        if (e.type !== "PushEvent") continue;
        const date = toLocalDate(e.created_at, timezone);
        perDay.set(date, (perDay.get(date) ?? 0) + (e.payload?.size ?? e.payload?.commits?.length ?? 1));
      }
      if (events.length < 100) break;
    }
    const out: NormalizedRecord[] = [];
    const from = addDays(today, -89);
    for (const [date, commits] of perDay) {
      if (date < from) continue;
      out.push({ externalId: `github|${date}`, recordType: "daily_commits", raw: { date, commits }, outputs: [{ type: "metric", metricKey: "commits", value: commits, date }] });
    }
    return out;
  },
};
