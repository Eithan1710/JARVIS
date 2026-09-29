import type { ISODate } from "@/lib/dates";

/** What an integration produces: raw record + normalized outputs in NOVA's own model. */
export type NormalizedOutput =
  | { type: "metric"; metricKey: string; value: number; date: ISODate; startAt?: Date | null; endAt?: Date | null; rawValue?: unknown; note?: string | null; meta?: Record<string, unknown> }
  | { type: "transaction"; date: ISODate; amount: number; currency?: string; category: string; description?: string | null; merchant?: string | null }
  | { type: "calendar"; externalId: string; title: string; startAt: Date; endAt: Date; allDay: boolean; location?: string | null; kind: string };

export interface NormalizedRecord {
  externalId: string;
  recordType: string;
  raw: unknown;
  outputs: NormalizedOutput[];
}

export interface IntegrationField {
  key: string;
  label: string;
  type: "text" | "secret" | "number";
  placeholder?: string;
  help?: string;
  required?: boolean;
  /** Direction for mixed content (URLs/usernames are LTR). */
  dir?: "ltr" | "rtl";
}

export interface IntegrationDefinition {
  id: string;
  name: string;
  description: string;
  category: "health" | "calendar" | "finance" | "work" | "environment" | "files" | "music" | "notes";
  /** How it connects. */
  auth: "secret_url" | "token" | "webhook" | "file" | "location" | "none";
  dataTypes: string[];
  status: "available" | "coming_soon";
  fields: IntegrationField[];
  setupSteps: string[];
  /** Pull-based sync. Webhook/file integrations push data instead. */
  sync?: (args: { config: Record<string, unknown>; secrets: Record<string, string>; timezone: string; today: ISODate }) => Promise<NormalizedRecord[]>;
  /** Split config/secrets from the setup form values. */
  secretKeys?: string[];
}
