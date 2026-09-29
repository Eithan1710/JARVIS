import "server-only";
import type { IntegrationDefinition } from "./types";
import { icsCalendar } from "./providers/ics-calendar";
import { healthWebhook } from "./providers/health-webhook";
import { github, weather } from "./providers/pull";
import { csvImport } from "./providers/csv";

const comingSoon = (id: string, name: string, description: string, category: IntegrationDefinition["category"], dataTypes: string[]): IntegrationDefinition => ({
  id,
  name,
  description,
  category,
  auth: "none",
  dataTypes,
  status: "coming_soon",
  fields: [],
  setupSteps: [],
});

export const INTEGRATIONS: IntegrationDefinition[] = [
  healthWebhook,
  icsCalendar,
  csvImport,
  weather,
  github,
  comingSoon("hevy", "Hevy", "יומן האימונים שלך — תרגילים, סטים ונפח (דורש Hevy Pro עם מפתח API).", "health", ["אימונים", "נפח אימון"]),
  comingSoon("health_connect", "Google Health Connect", "נתוני בריאות ממכשירי אנדרואיד ושעונים חכמים.", "health", ["שינה", "צעדים", "דופק"]),
  comingSoon("spotify", "Spotify", "זמן האזנה וסוגי מוזיקה לאורך היום.", "music", ["זמן האזנה"]),
  comingSoon("notion", "Notion", "משימות ורשומות מדפים נבחרים.", "notes", ["משימות", "רשומות"]),
];

export const INTEGRATION_MAP = new Map(INTEGRATIONS.map((i) => [i.id, i]));
