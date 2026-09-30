import { NextResponse, type NextRequest } from "next/server";
import { aiErrorMessage, transcribe } from "@/server/ai/router";
import { jsonError } from "@/server/api/handler";
import { getUserContext, UnauthorizedError, type UserContext } from "@/server/context";
import { errorInfo, logger } from "@/server/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const log = logger("voice");
const MAX_BYTES = 12 * 1024 * 1024;

/** Speech → text. Audio is transcribed and discarded; only the transcript enters history (as the user's message). */
export async function POST(req: NextRequest) {
  let ctx: UserContext;
  try {
    ctx = await getUserContext();
  } catch (e) {
    if (e instanceof UnauthorizedError) return jsonError(401, "unauthorized", "נדרשת כניסה מחדש");
    throw e;
  }
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size < 800) return jsonError(400, "no_audio", "לא נקלט קול. נסה שוב.");
  if (audio.size > MAX_BYTES) return jsonError(413, "too_large", "ההקלטה ארוכה מדי.");
  const type = audio.type || "audio/webm";
  const ext = type.includes("mp4") || type.includes("m4a") || type.includes("aac") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
  try {
    const { text } = await transcribe(audio, { language: "he", filename: `voice.${ext}`, audit: { ctx, purpose: "transcribe" } });
    if (!text.trim()) return jsonError(422, "empty", "לא הצלחתי לשמוע מילים. נסה שוב.");
    return NextResponse.json({ data: { text: text.trim() } }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    log.warn("transcription failed", errorInfo(e));
    return jsonError(502, "transcription_failed", aiErrorMessage(e));
  }
}
