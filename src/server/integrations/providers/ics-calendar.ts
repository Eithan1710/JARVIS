import "server-only";
import ICAL from "ical.js";
import { addDays, toLocalDate, zonedTime, type ISODate } from "@/lib/dates";
import type { IntegrationDefinition, NormalizedRecord } from "../types";

const MEETING_HINTS = /פגיש|ישיב|שיחה|meeting|sync|standup|stand-up|1:1|call|review|interview|ראיון|zoom|teams|meet/i;

/** Calendar via a private ICS link — works for Google Calendar and Outlook without OAuth. */
export const icsCalendar: IntegrationDefinition = {
  id: "ics_calendar",
  name: "יומן (Google / Outlook)",
  description: "מסנכרן אירועים מהיומן שלך דרך קישור ICS פרטי — בלי הרשאות גישה לחשבון.",
  category: "calendar",
  auth: "secret_url",
  dataTypes: ["אירועים", "פגישות", "עומס ביומן"],
  status: "available",
  secretKeys: ["url"],
  fields: [
    { key: "url", label: "קישור ICS פרטי", type: "secret", placeholder: "https://calendar.google.com/calendar/ical/…/basic.ics", required: true, dir: "ltr" },
    { key: "label", label: "שם היומן (לא חובה)", type: "text", placeholder: "עבודה" },
  ],
  setupSteps: [
    "ב־Google Calendar: הגדרות ← בחר את היומן ← „שילוב יומן” ← העתק את „כתובת סודית בפורמט iCal”.",
    "ב־Outlook: הגדרות ← יומן ← יומנים משותפים ← „פרסם יומן” ← העתק את קישור ה־ICS.",
    "הקישור נשמר מוצפן ומשמש רק לקריאה.",
  ],
  async sync({ secrets, timezone, today }) {
    const url = secrets.url;
    if (!url || !/^https:\/\//.test(url)) throw new Error("invalid ICS url");
    const res = await fetch(url.replace(/^webcal:/, "https:"), { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`ICS fetch failed (${res.status})`);
    const text = await res.text();
    return parseIcs(text, timezone, addDays(today, -120), addDays(today, 30));
  },
};

export function parseIcs(text: string, timezone: string, from: ISODate, to: ISODate): NormalizedRecord[] {
  const comp = new ICAL.Component(ICAL.parse(text));
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* already registered */
    }
  }
  const rangeStart = zonedTime(from, "00:00", timezone);
  const rangeEnd = zonedTime(addDays(to, 1), "00:00", timezone);
  const out: NormalizedRecord[] = [];
  const vevents = comp.getAllSubcomponents("vevent");
  // Overrides of recurring instances (RECURRENCE-ID) replace the generated occurrence.
  const overrides = new Set(
    vevents.filter((v) => v.hasProperty("recurrence-id")).map((v) => `${v.getFirstPropertyValue("uid")}|${(v.getFirstPropertyValue("recurrence-id") as ICAL.Time).toJSDate().getTime()}`),
  );

  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (String(v.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
    const title = ev.summary || "אירוע";
    const kind = MEETING_HINTS.test(title) || (v.getAllProperties("attendee").length > 1) ? "meeting" : "other";
    const allDay = ev.startDate?.isDate ?? false;
    const push = (start: Date, end: Date, occurrenceKey: string) => {
      if (end < rangeStart || start > rangeEnd) return;
      out.push({
        externalId: `${ev.uid}|${occurrenceKey}`,
        recordType: "calendar_event",
        raw: { uid: ev.uid, summary: title, start: start.toISOString(), end: end.toISOString(), allDay, location: ev.location ?? null },
        outputs: [{ type: "calendar", externalId: `${ev.uid}|${occurrenceKey}`, title, startAt: start, endAt: end, allDay, location: ev.location || null, kind }],
      });
    };

    if (ev.isRecurring() && !v.hasProperty("recurrence-id")) {
      const it = ev.iterator();
      let next: ICAL.Time | null;
      let guard = 0;
      while ((next = it.next()) && guard++ < 2000) {
        const occStart = next.toJSDate();
        if (occStart > rangeEnd) break;
        if (overrides.has(`${ev.uid}|${occStart.getTime()}`)) continue;
        const details = ev.getOccurrenceDetails(next);
        push(details.startDate.toJSDate(), details.endDate.toJSDate(), String(occStart.getTime()));
      }
    } else if (ev.startDate) {
      const start = ev.startDate.toJSDate();
      const end = ev.endDate ? ev.endDate.toJSDate() : new Date(start.getTime() + 3600_000);
      const key = v.hasProperty("recurrence-id") ? String((v.getFirstPropertyValue("recurrence-id") as ICAL.Time).toJSDate().getTime()) : "single";
      push(start, end, key);
    }
  }
  return out;
}

export const calendarDay = (d: Date, tz: string) => toLocalDate(d, tz);
