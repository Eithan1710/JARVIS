"use client";
import { useState } from "react";
import { Core } from "@/components/core";

export default function Unlock() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      if (res.ok) {
        const next = new URLSearchParams(location.search).get("next");
        location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        return;
      }
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(j?.error?.message ?? "לא הצלחתי להיכנס");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-6" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
      <Core size={120} state={busy ? "thinking" : "idle"} className="mb-10" />
      <p className="mb-8 font-[family-name:var(--font-mark)] text-[0.9rem] tracking-[0.4em] text-pearl-2" dir="ltr">
        JARVIS
      </p>
      <form onSubmit={submit} className="w-full max-w-xs">
        <label htmlFor="code" className="mb-3 block text-center text-mist">
          קוד גישה
        </label>
        <input
          id="code"
          type="password"
          inputMode="text"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="composer w-full rounded-2xl px-4 py-3 text-center text-[1.1rem] tracking-[0.3em] text-pearl outline-none"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "err" : undefined}
        />
        <button type="submit" disabled={!code || busy} className="mt-4 w-full rounded-2xl bg-pearl py-3 font-medium text-abyss transition-opacity disabled:opacity-40">
          {busy ? "בודק…" : "כניסה"}
        </button>
        <p id="err" role="alert" className="mt-4 min-h-6 text-center text-[0.9rem] text-danger">
          {error}
        </p>
      </form>
    </main>
  );
}
