"use client";
import { enqueue } from "./outbox";
import { toast } from "./store";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function onUnauthorized() {
  if (typeof window !== "undefined" && !location.pathname.startsWith("/unlock")) {
    location.href = `/unlock?next=${encodeURIComponent(location.pathname + location.search)}`;
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: { data?: T; error?: { code: string; message: string } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    throw new ApiClientError(res.status, json?.error?.code ?? "http", json?.error?.message ?? "משהו השתבש");
  }
  return (json?.data ?? null) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } });
  return parse<T>(res);
}

export interface SendOptions {
  /** Queue in the offline outbox if the network is unavailable. */
  offline?: boolean;
  /** Human label for the sync UI, e.g. "סימון הרגל". */
  label?: string;
}

export type SendResult<T> = { data: T; queued: false } | { data: null; queued: true };

export async function apiSend<T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown, opts: SendOptions = {}): Promise<SendResult<T>> {
  const queue = async (): Promise<SendResult<T>> => {
    await enqueue({ method, path, body, label: opts.label ?? "פעולה" });
    toast("נשמר במכשיר · יסונכרן כשהחיבור יחזור", { tone: "offline" });
    return { data: null, queued: true };
  };
  if (opts.offline && typeof navigator !== "undefined" && !navigator.onLine) return queue();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (opts.offline) return queue();
    throw new ApiClientError(0, "network", "אין חיבור לשרת");
  }
  return { data: await parse<T>(res), queued: false };
}

export const api = {
  get: apiGet,
  post: <T>(p: string, b?: unknown, o?: SendOptions) => apiSend<T>("POST", p, b ?? {}, o),
  put: <T>(p: string, b?: unknown, o?: SendOptions) => apiSend<T>("PUT", p, b ?? {}, o),
  patch: <T>(p: string, b?: unknown, o?: SendOptions) => apiSend<T>("PATCH", p, b ?? {}, o),
  del: <T>(p: string, b?: unknown, o?: SendOptions) => apiSend<T>("DELETE", p, b, o),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  return "משהו השתבש";
}
