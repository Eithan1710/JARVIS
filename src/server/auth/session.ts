/**
 * Session tokens (edge-compatible: used by the request proxy and by route handlers).
 * Intentionally does not import server-only modules.
 */
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "jarvis_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 180; // 180 days — personal device, long-lived

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
    return new TextEncoder().encode("jarvis-dev-session-secret-not-for-production");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  uid: string;
}

export async function createSessionToken(uid: string): Promise<string> {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .setAudience("jarvis")
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "jarvis", algorithms: ["HS256"] });
    return typeof payload.uid === "string" ? { uid: payload.uid } : null;
  } catch {
    return null;
  }
}

/** Auth is required whenever a passcode is configured, and always in production. */
export function authRequired(): boolean {
  return Boolean(process.env.APP_PASSCODE) || process.env.NODE_ENV === "production";
}
