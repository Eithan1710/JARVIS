import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { ISODate } from "@/lib/dates";
import { METRIC_MAP } from "@/lib/metrics";
import type { UserContext } from "../context";
import { decryptJson, encryptJson, randomToken, sha256 } from "../crypto";
import { getDb } from "../db/client";
import { calendarEvents, importedRecords, integrations, metrics, transactions } from "../db/schema";
import { badRequest, notFound } from "../api/handler";
import { errorInfo, logger } from "../logger";
import { syncHabitsFromMetrics } from "../services/data";
import { INTEGRATION_MAP } from "./registry";
import type { NormalizedRecord } from "./types";

const log = logger("integrations");

/**
 * Store raw records (provenance) and write their normalized outputs into NOVA's model.
 * Idempotent: re-importing the same external record updates it in place.
 */
export async function ingestRecords(ctx: UserContext, provider: string, integrationId: string | null, records: NormalizedRecord[]) {
  const db = await getDb();
  const touchedDates = new Set<ISODate>();
  let written = 0;
  for (let i = 0; i < records.length; i += 200) {
    const chunk = records.slice(i, i + 200);
    await db.transaction(async (tx) => {
      for (const rec of chunk) {
        const [raw] = await tx
          .insert(importedRecords)
          .values({ userId: ctx.userId, integrationId, provider, externalId: rec.externalId.slice(0, 500), recordType: rec.recordType, raw: rec.raw as object, status: "processed" })
          .onConflictDoUpdate({ target: [importedRecords.userId, importedRecords.provider, importedRecords.externalId], set: { raw: rec.raw as object, importedAt: new Date(), status: "processed", error: null } })
          .returning({ id: importedRecords.id });
        for (const o of rec.outputs) {
          if (o.type === "metric") {
            await tx
              .insert(metrics)
              .values({
                userId: ctx.userId,
                metricKey: o.metricKey,
                value: o.value,
                unit: METRIC_MAP.get(o.metricKey)?.unit ?? null,
                date: o.date,
                startAt: o.startAt ?? null,
                endAt: o.endAt ?? null,
                note: o.note ?? null,
                source: provider,
                sourceRecordId: raw.id,
                rawValue: (o.rawValue ?? null) as object | null,
                meta: o.meta ?? {},
              })
              .onConflictDoUpdate({ target: [metrics.sourceRecordId, metrics.metricKey], set: { value: o.value, date: o.date, startAt: o.startAt ?? null, endAt: o.endAt ?? null } });
            touchedDates.add(o.date);
          } else if (o.type === "transaction") {
            await tx.delete(transactions).where(eq(transactions.sourceRecordId, raw.id));
            await tx.insert(transactions).values({
              userId: ctx.userId,
              date: o.date,
              amount: Math.round(o.amount * 100) / 100,
              currency: o.currency ?? "ILS",
              category: o.category,
              description: o.description ?? null,
              merchant: o.merchant ?? null,
              source: provider,
              sourceRecordId: raw.id,
            });
          } else if (o.type === "calendar") {
            await tx
              .insert(calendarEvents)
              .values({ userId: ctx.userId, title: o.title, startAt: o.startAt, endAt: o.endAt, allDay: o.allDay, location: o.location ?? null, kind: o.kind, source: provider, externalId: o.externalId.slice(0, 500), integrationId })
              .onConflictDoUpdate({
                target: [calendarEvents.userId, calendarEvents.source, calendarEvents.externalId],
                set: { title: o.title, startAt: o.startAt, endAt: o.endAt, allDay: o.allDay, location: o.location ?? null, kind: o.kind, updatedAt: new Date() },
              });
          }
          written++;
        }
      }
    });
  }
  if (touchedDates.size) await syncHabitsFromMetrics(ctx, [...touchedDates].slice(-60));
  return { records: records.length, outputs: written };
}

export async function listIntegrations(ctx: UserContext) {
  const db = await getDb();
  const rows = await db.select().from(integrations).where(eq(integrations.userId, ctx.userId)).orderBy(desc(integrations.createdAt));
  const counts = await db
    .select({ integrationId: importedRecords.integrationId, n: sql<number>`count(*)::int` })
    .from(importedRecords)
    .where(eq(importedRecords.userId, ctx.userId))
    .groupBy(importedRecords.integrationId);
  return rows.map(({ secretsEncrypted, ingestTokenHash, ...r }) => ({
    ...r,
    hasSecrets: Boolean(secretsEncrypted),
    hasIngestToken: Boolean(ingestTokenHash),
    records: counts.find((c) => c.integrationId === r.id)?.n ?? 0,
  }));
}

export async function connectIntegration(ctx: UserContext, provider: string, values: Record<string, unknown>) {
  const def = INTEGRATION_MAP.get(provider);
  if (!def || def.status !== "available") throw badRequest("החיבור הזה עדיין לא זמין");
  if (def.auth === "file") throw badRequest("ייבוא קבצים לא דורש חיבור");
  for (const f of def.fields) if (f.required && (values[f.key] == null || values[f.key] === "")) throw badRequest(`חסר שדה: ${f.label}`);
  const secretKeys = new Set(def.secretKeys ?? []);
  const config: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};
  for (const f of def.fields) {
    const v = values[f.key];
    if (v == null || v === "") continue;
    if (secretKeys.has(f.key)) secrets[f.key] = String(v).trim();
    else config[f.key] = f.type === "number" ? Number(v) : String(v).trim();
  }
  let ingestToken: string | null = null;
  const db = await getDb();
  const [row] = await db
    .insert(integrations)
    .values({
      userId: ctx.userId,
      provider,
      config,
      secretsEncrypted: Object.keys(secrets).length ? encryptJson(secrets) : null,
      ingestTokenHash: def.auth === "webhook" ? sha256((ingestToken = randomToken(24))) : null,
    })
    .returning();
  let syncResult: Awaited<ReturnType<typeof syncIntegration>> | null = null;
  if (def.sync) syncResult = await syncIntegration(ctx, row.id).catch(() => null);
  return { id: row.id, ingestToken, syncResult };
}

export async function regenerateIngestToken(ctx: UserContext, id: string) {
  const db = await getDb();
  const token = randomToken(24);
  const [row] = await db
    .update(integrations)
    .set({ ingestTokenHash: sha256(token) })
    .where(and(eq(integrations.id, id), eq(integrations.userId, ctx.userId)))
    .returning();
  if (!row) throw notFound("החיבור");
  return token;
}

export async function syncIntegration(ctx: UserContext, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(integrations).where(and(eq(integrations.id, id), eq(integrations.userId, ctx.userId))).limit(1);
  if (!row) throw notFound("החיבור");
  const def = INTEGRATION_MAP.get(row.provider);
  if (!def?.sync) return { records: 0, outputs: 0 };
  try {
    const secrets = row.secretsEncrypted ? decryptJson<Record<string, string>>(row.secretsEncrypted) : {};
    const records = await def.sync({ config: row.config, secrets, timezone: ctx.timezone, today: ctx.today });
    const res = await ingestRecords(ctx, row.provider, row.id, records);
    await db.update(integrations).set({ lastSyncAt: new Date(), lastError: null, status: "active" }).where(eq(integrations.id, id));
    log.info("synced", { provider: row.provider, records: res.records });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "sync failed";
    await db.update(integrations).set({ lastError: msg, status: "error" }).where(eq(integrations.id, id));
    log.warn("sync failed", { provider: row.provider, ...errorInfo(e) });
    throw badRequest("הסנכרון נכשל. בדוק את פרטי החיבור ונסה שוב.");
  }
}

export async function syncAllIntegrations(ctx: UserContext) {
  const db = await getDb();
  const rows = await db.select({ id: integrations.id, provider: integrations.provider }).from(integrations).where(and(eq(integrations.userId, ctx.userId), inArray(integrations.status, ["active", "error"])));
  const results: Record<string, string> = {};
  for (const r of rows) {
    if (!INTEGRATION_MAP.get(r.provider)?.sync) continue;
    try {
      await syncIntegration(ctx, r.id);
      results[r.provider] = "ok";
    } catch {
      results[r.provider] = "failed";
    }
  }
  return results;
}

/**
 * Disconnect. By default imported data stays (it's the user's history); pass purge=true to
 * delete everything that came from this connection.
 */
export async function disconnectIntegration(ctx: UserContext, id: string, purge = false) {
  const db = await getDb();
  const [row] = await db.select().from(integrations).where(and(eq(integrations.id, id), eq(integrations.userId, ctx.userId))).limit(1);
  if (!row) throw notFound("החיבור");
  await db.transaction(async (tx) => {
    if (purge) {
      const recs = tx.select({ id: importedRecords.id }).from(importedRecords).where(eq(importedRecords.integrationId, id));
      await tx.delete(metrics).where(inArray(metrics.sourceRecordId, recs));
      await tx.delete(transactions).where(inArray(transactions.sourceRecordId, recs));
      await tx.delete(calendarEvents).where(eq(calendarEvents.integrationId, id));
      await tx.delete(importedRecords).where(eq(importedRecords.integrationId, id));
    }
    await tx.delete(integrations).where(eq(integrations.id, id));
  });
}

export async function findIntegrationByToken(token: string) {
  const db = await getDb();
  const [row] = await db.select().from(integrations).where(eq(integrations.ingestTokenHash, sha256(token))).limit(1);
  return row ?? null;
}
