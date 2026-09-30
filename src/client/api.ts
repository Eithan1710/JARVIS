"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function onUnauthorized() {
  if (typeof window !== "undefined" && !location.pathname.startsWith("/unlock")) location.href = "/unlock";
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 401) onUnauthorized();
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null;
  if (!res.ok || !json || json.error) {
    throw new ApiError(res.status, json?.error?.code ?? "error", json?.error?.message ?? "משהו השתבש");
  }
  return json.data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { credentials: "same-origin", cache: "no-store" }));
}

export async function apiSend<T>(method: "POST" | "DELETE" | "PATCH", url: string, body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export async function apiUpload<T>(url: string, form: FormData): Promise<T> {
  return parse<T>(await fetch(url, { method: "POST", credentials: "same-origin", body: form }));
}
