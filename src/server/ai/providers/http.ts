import "server-only";
import { AIError } from "../types";

export async function timedFetch(url: string, init: RequestInit, timeoutMs: number, provider: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AIError("timeout", "request timed out", provider);
    throw new AIError("unavailable", e instanceof Error ? e.message : "network error", provider);
  }
}

export async function httpError(res: Response, provider: string): Promise<AIError> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 240).replace(/\s+/g, " ");
  } catch {
    /* ignore */
  }
  if (res.status === 429) return new AIError("rate_limit", `rate limited: ${detail}`, provider);
  if (res.status === 401 || res.status === 403) return new AIError("auth", `auth failed (${res.status})`, provider);
  if (res.status >= 500) return new AIError("unavailable", `server error ${res.status}`, provider);
  return new AIError("bad_response", `http ${res.status}: ${detail}`, provider);
}
