import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function encryptionKey(): Buffer {
  const { ENCRYPTION_KEY, SESSION_SECRET, NODE_ENV } = env();
  if (ENCRYPTION_KEY) {
    const buf = /^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)
      ? Buffer.from(ENCRYPTION_KEY, "hex")
      : Buffer.from(ENCRYPTION_KEY, "base64");
    if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
    return buf;
  }
  if (SESSION_SECRET) return createHash("sha256").update(`nova-enc:${SESSION_SECRET}`).digest();
  if (NODE_ENV === "production") throw new Error("ENCRYPTION_KEY or SESSION_SECRET is required in production");
  return createHash("sha256").update("nova-dev-only-key").digest();
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptJson<T = unknown>(payload: string): T {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")) as T;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
