import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Field types without defaults — reused by the PATCH schema so partial updates never inject defaults. */
const notificationFields = {
  enabled: z.boolean(),
  habitReminders: z.boolean(),
  /** "HH:MM" or null to disable. */
  checkinReminder: hhmm.nullable(),
  dailyBrief: z.boolean(),
  weeklyReview: z.boolean(),
  insights: z.boolean(),
  quietStart: hhmm,
  quietEnd: hhmm,
  maxPerDay: z.number().int().min(0).max(12),
  minGapMinutes: z.number().int().min(15).max(480),
};

const aiFields = {
  enabled: z.boolean(),
  /** Whether journal/check-in free text may be included in AI context. */
  shareJournalText: z.boolean(),
  /** Whether individual transactions (not just totals) may be included. */
  shareTransactions: z.boolean(),
  /** Let the AI suggest memories (always require confirmation). */
  proposeMemories: z.boolean(),
};

const locationSchema = z.object({ name: z.string().max(80), latitude: z.number(), longitude: z.number() });
const proactivity = z.enum(["quiet", "balanced", "active"]);

export const DEFAULT_SETTINGS = {
  notifications: {
    enabled: true,
    habitReminders: true,
    checkinReminder: "21:30" as string | null,
    dailyBrief: false,
    weeklyReview: true,
    insights: false,
    quietStart: "22:30",
    quietEnd: "07:30",
    maxPerDay: 3,
    minGapMinutes: 90,
  },
  ai: { enabled: true, shareJournalText: true, shareTransactions: false, proposeMemories: true },
  proactivity: "balanced" as "quiet" | "balanced" | "active",
  location: null as z.infer<typeof locationSchema> | null,
  onboarded: false,
};

export type Settings = typeof DEFAULT_SETTINGS;

const storedSchema = z.object({
  notifications: z.object(notificationFields).partial().optional(),
  ai: z.object(aiFields).partial().optional(),
  proactivity: proactivity.optional(),
  location: locationSchema.nullable().optional(),
  onboarded: z.boolean().optional(),
});

/** Merge stored (possibly partial or stale) settings over defaults. Never throws. */
export function parseSettings(raw: unknown): Settings {
  const parsed = storedSchema.safeParse(raw ?? {});
  const s = parsed.success ? parsed.data : {};
  return {
    notifications: { ...DEFAULT_SETTINGS.notifications, ...stripUndefined(s.notifications) },
    ai: { ...DEFAULT_SETTINGS.ai, ...stripUndefined(s.ai) },
    proactivity: s.proactivity ?? DEFAULT_SETTINGS.proactivity,
    location: s.location === undefined ? DEFAULT_SETTINGS.location : s.location,
    onboarded: s.onboarded ?? DEFAULT_SETTINGS.onboarded,
  };
}

function stripUndefined<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const settingsPatchSchema = z.object({
  displayName: z.string().max(60).optional(),
  timezone: z.string().max(60).optional(),
  settings: storedSchema.optional(),
});
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export function mergeSettings(current: Settings, patch: SettingsPatch["settings"]): Settings {
  if (!patch) return current;
  return {
    notifications: { ...current.notifications, ...stripUndefined(patch.notifications) },
    ai: { ...current.ai, ...stripUndefined(patch.ai) },
    proactivity: patch.proactivity ?? current.proactivity,
    location: patch.location === undefined ? current.location : patch.location,
    onboarded: patch.onboarded ?? current.onboarded,
  };
}
