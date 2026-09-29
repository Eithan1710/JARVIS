import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/crypto";
import { env } from "@/server/env";
import { jsonError } from "@/server/api/handler";
import { runTick } from "@/server/jobs/runner";
import { errorInfo, logger } from "@/server/logger";

export const maxDuration = 60;
const log = logger("cron");

/** Called by GitHub Actions / cron-job.org / Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
async function handler(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return jsonError(401, "unauthorized", "unauthorized");
  try {
    return NextResponse.json({ ok: true, ...(await runTick()) });
  } catch (e) {
    log.error("tick failed", errorInfo(e));
    return jsonError(500, "internal", "tick failed");
  }
}

export const GET = handler;
export const POST = handler;
