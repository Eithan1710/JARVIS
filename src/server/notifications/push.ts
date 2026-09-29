import "server-only";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "../db/client";
import { pushSubscriptions } from "../db/schema";
import { env } from "../env";
import { errorInfo, logger } from "../logger";

const log = logger("push");

let configured = false;
export function pushConfigured(): boolean {
  const e = env();
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return false;
  if (!configured) {
    webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  id: string;
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
}

/** Send to every registered device. Returns number of successful deliveries. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const db = await getDb();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6, urgency: "normal", topic: payload.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "") || undefined },
      );
      ok++;
      await db.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failureCount: 0 }).where(eq(pushSubscriptions.id, s.id));
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        log.info("removed expired subscription");
      } else {
        await db.update(pushSubscriptions).set({ failureCount: s.failureCount + 1 }).where(eq(pushSubscriptions.id, s.id));
        log.warn("push failed", { status, ...errorInfo(e) });
      }
    }
  }
  return ok;
}
