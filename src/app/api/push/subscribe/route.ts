import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { route } from "@/server/api/handler";
import { getDb } from "@/server/db/client";
import { pushSubscriptions } from "@/server/db/schema";

const sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export const POST = route({ body: sub }, async (ctx, { body, req }) => {
  const db = await getDb();
  await db
    .insert(pushSubscriptions)
    .values({ userId: ctx.userId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: body.keys.p256dh, auth: body.keys.auth, userId: ctx.userId, failureCount: 0 } });
  return { ok: true };
});

export const DELETE = route({ body: z.object({ endpoint: z.string().max(1000) }) }, async (ctx, { body }) => {
  const db = await getDb();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, ctx.userId)));
  return { ok: true };
});
