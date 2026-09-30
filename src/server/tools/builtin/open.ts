import "server-only";
import { z } from "zod";
import { parseLocalDateTime } from "@/lib/recurrence";
import { defineTool } from "../types";

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const OPENED = "The browser will offer the user a one-tap button to open it (web apps can't open other apps silently). Say so briefly, in Hebrew.";

export const openUrlTool = defineTool({
  name: "open_url",
  description: `Open any website or web link for the user. ${OPENED}`,
  signature: "{ url: string, label?: string }",
  params: z.object({ url: z.string().min(3), label: z.string().max(60).optional() }),
  status: () => "פותח…",
  icon: "link",
  async run(a) {
    const url = safeUrl(a.url);
    if (!url) return { ok: false, error: "invalid url" };
    const host = new URL(url).hostname.replace(/^www\./, "");
    return { ok: true, data: { url }, action: { type: "open_url", url, label: a.label ?? `פתח את ${host}`, icon: "link" } };
  },
});

export const openYoutubeTool = defineTool({
  name: "open_youtube",
  description: `Open YouTube, optionally searching for something (a song, a video, a topic). ${OPENED}`,
  signature: "{ query?: string }",
  params: z.object({ query: z.string().max(200).optional() }),
  status: () => "פותח את YouTube…",
  icon: "youtube",
  async run(a) {
    const url = a.query ? `https://www.youtube.com/results?search_query=${encodeURIComponent(a.query)}` : "https://www.youtube.com/";
    return { ok: true, data: { url }, action: { type: "open_url", url, label: a.query ? `YouTube · ${a.query}` : "פתח את YouTube", icon: "youtube" } };
  },
});

export const openSpotifyTool = defineTool({
  name: "open_spotify",
  description: `Open Spotify at a song/artist/playlist search (opens the Spotify app on phones). Starting playback directly is not possible yet (needs a Spotify connection) — the user taps play. ${OPENED}`,
  signature: "{ query?: string }",
  params: z.object({ query: z.string().max(200).optional() }),
  status: () => "פותח את Spotify…",
  icon: "music",
  async run(a) {
    const url = a.query ? `https://open.spotify.com/search/${encodeURIComponent(a.query)}` : "https://open.spotify.com/";
    return { ok: true, data: { url, note: "opens search; user taps play" }, action: { type: "open_url", url, label: a.query ? `Spotify · ${a.query}` : "פתח את Spotify", icon: "music" } };
  },
});

export const openMapsTool = defineTool({
  name: "open_maps",
  description: `Navigation / directions to a place. app: 'waze' (popular in Israel, driving), 'google' (default; supports walking/transit), or 'apple'. ${OPENED}`,
  signature: "{ destination: string, app?: 'google'|'waze'|'apple', mode?: 'driving'|'walking'|'transit'|'bicycling' }",
  params: z.object({
    destination: z.string().min(2).max(300),
    app: z.enum(["google", "waze", "apple"]).default("google"),
    mode: z.enum(["driving", "walking", "transit", "bicycling"]).default("driving"),
  }),
  status: () => "פותח ניווט…",
  icon: "map",
  async run(a) {
    const q = encodeURIComponent(a.destination);
    const url =
      a.app === "waze"
        ? `https://waze.com/ul?q=${q}&navigate=yes`
        : a.app === "apple"
          ? `https://maps.apple.com/?daddr=${q}&dirflg=${a.mode === "walking" ? "w" : a.mode === "transit" ? "r" : "d"}`
          : `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=${a.mode}`;
    const app = a.app === "waze" ? "Waze" : a.app === "apple" ? "Apple Maps" : "Google Maps";
    return { ok: true, data: { url }, action: { type: "open_url", url, label: `ניווט ל${a.destination} · ${app}`, icon: "map" } };
  },
});

export const openGithubTool = defineTool({
  name: "open_github",
  description: `Open GitHub, optionally at a path like 'owner/repo' or 'owner/repo/issues'. ${OPENED}`,
  signature: "{ path?: string }",
  params: z.object({ path: z.string().max(200).optional() }),
  status: () => "פותח את GitHub…",
  icon: "github",
  async run(a) {
    const path = (a.path ?? "").replace(/^https?:\/\/(www\.)?github\.com\/?/, "").replace(/^\/+/, "");
    const url = `https://github.com/${path.split("/").map(encodeURIComponent).join("/")}`;
    return { ok: true, data: { url }, action: { type: "open_url", url, label: path ? `GitHub · ${path}` : "פתח את GitHub", icon: "github" } };
  },
});

function gcalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export const createCalendarEventTool = defineTool({
  name: "create_calendar_event",
  description:
    "Prepare a calendar event. No calendar is connected yet, so this produces a pre-filled Google Calendar link the user taps to save (tell them that). start/end are LOCAL 'YYYY-MM-DDTHH:MM'. For all-day or unclear times ask, or default to 1 hour.",
  signature: "{ title: string, start: 'YYYY-MM-DDTHH:MM', end?: 'YYYY-MM-DDTHH:MM', duration_min?: number, location?: string, details?: string }",
  params: z.object({
    title: z.string().min(1).max(200),
    start: z.string(),
    end: z.string().optional(),
    duration_min: z.coerce.number().min(5).max(24 * 60).optional(),
    location: z.string().max(300).optional(),
    details: z.string().max(2000).optional(),
  }),
  status: () => "מכין אירוע ביומן…",
  icon: "calendar",
  async run(a, t) {
    const start = parseLocalDateTime(a.start, t.ctx.timezone);
    if (!start) return { ok: false, error: "could not parse start" };
    const end = (a.end && parseLocalDateTime(a.end, t.ctx.timezone)) || new Date(start.getTime() + (a.duration_min ?? 60) * 60_000);
    const p = new URLSearchParams({ action: "TEMPLATE", text: a.title, dates: `${gcalStamp(start)}/${gcalStamp(end)}`, ctz: t.ctx.timezone });
    if (a.location) p.set("location", a.location);
    if (a.details) p.set("details", a.details);
    const url = `https://calendar.google.com/calendar/render?${p.toString()}`;
    return { ok: true, data: { url, note: "user must tap to save it in Google Calendar" }, action: { type: "open_url", url, label: `הוסף ליומן · ${a.title}`, icon: "calendar" } };
  },
});
