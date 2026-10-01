import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authRequired, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/server/auth/session";
import { ensureOwner } from "@/server/context";
import { safeEqual } from "@/server/crypto";
import { env } from "@/server/env";
import { jsonError } from "@/server/api/handler";
import { logger } from "@/server/logger";

const log = logger("auth");
const attempts = new Map<string, { count: number; until: number }>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return jsonError(429, "locked", "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.");

  const { APP_PASSCODE, NODE_ENV, SESSION_SECRET } = env();
  if (!authRequired()) return NextResponse.json({ data: { ok: true } });
  if (!APP_PASSCODE) {
    if (NODE_ENV === "production") return jsonError(503, "not_configured", "לא הוגדר קוד גישה (APP_PASSCODE) בשרת.");
  } else if (!SESSION_SECRET && NODE_ENV === "production") {
    return jsonError(503, "not_configured", "לא הוגדר SESSION_SECRET בשרת.");
  }

  const body = z.object({ passcode: z.string().max(200) }).safeParse(await req.json().catch(() => ({})));
  const ok = !APP_PASSCODE || (body.success && safeEqual(body.data.passcode, APP_PASSCODE));
  if (!ok) {
    const count = (a?.count ?? 0) + 1;
    attempts.set(ip, { count, until: count >= 5 ? Date.now() + 5 * 60_000 : 0 });
    log.warn("failed unlock", { attempts: count });
    await new Promise((r) => setTimeout(r, 600));
    return jsonError(401, "wrong_passcode", "הקוד שגוי");
  }
  attempts.delete(ip);
  const uid = await ensureOwner();
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(uid), {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
