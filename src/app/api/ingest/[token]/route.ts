import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { loadContext } from "@/server/context";
import { getDb } from "@/server/db/client";
import { integrations } from "@/server/db/schema";
import { jsonError } from "@/server/api/handler";
import { normalizeHealthPayload } from "@/server/integrations/providers/health-webhook";
import { findIntegrationByToken, ingestRecords } from "@/server/integrations/service";
import { errorInfo, logger } from "@/server/logger";

export const maxDuration = 60;
const log = logger("ingest");

/** Public webhook authenticated by the secret token in the URL (e.g. an iOS Shortcut). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 20) return jsonError(404, "not_found", "not found");
  const integration = await findIntegrationByToken(token);
  if (!integration) {
    await new Promise((r) => setTimeout(r, 400));
    return jsonError(404, "not_found", "not found");
  }
  const text = await req.text();
  if (text.length > 5_000_000) return jsonError(413, "too_large", "payload too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonError(400, "invalid_json", "invalid JSON");
  }
  try {
    const ctx = await loadContext(integration.userId);
    const { records, rejected } = normalizeHealthPayload(body, ctx.timezone, ctx.today);
    if (rejected === -1) return jsonError(400, "unsupported_format", "expected {records:[{type,value,date}]} or Health Auto Export JSON");
    const res = await ingestRecords(ctx, integration.provider, integration.id, records);
    const db = await getDb();
    await db.update(integrations).set({ lastSyncAt: new Date(), lastError: null, status: "active" }).where(eq(integrations.id, integration.id));
    return NextResponse.json({ ok: true, received: records.length, rejected, written: res.outputs });
  } catch (e) {
    log.error("ingest failed", errorInfo(e));
    return jsonError(500, "internal", "ingest failed");
  }
}
