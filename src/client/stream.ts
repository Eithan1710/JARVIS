"use client";
import type { StreamEvent } from "@/lib/protocol";

export interface ChatRequest {
  conversationId: string | null;
  text: string;
  inputMode: "text" | "voice";
}

/** POST /api/chat and deliver each newline-delimited JSON event as it arrives. */
export async function streamChat(req: ChatRequest, onEvent: (e: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...req, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    signal,
  });
  if (res.status === 401) {
    location.href = "/unlock";
    return;
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    onEvent({ type: "error", message: j?.error?.message ?? "לא הצלחתי להתחבר. בדוק את החיבור ונסה שוב." });
    onEvent({ type: "done" });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawDone = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const e = JSON.parse(line) as StreamEvent;
        if (e.type === "done") sawDone = true;
        onEvent(e);
      } catch {
        /* ignore partial garbage */
      }
    }
  }
  if (!sawDone) onEvent({ type: "done" });
}
