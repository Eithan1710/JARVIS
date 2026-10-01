"use client";
import { useEffect, useState } from "react";
import { Orb } from "@/components/orb";

export default function Unlock() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // When no passcode is required the server answers OK immediately.
  useEffect(() => {
    void fetch("/api/auth/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => {
      if (r.ok) location.replace("/");
    });
  }, []);

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
      <Orb size={220} state={busy ? "thinking" : "idle"} />
      <p className="wordmark mb-10 mt-4 text-[0.95rem] text-ink" dir="ltr">
        JARVIS
      </p>
      <form onSubmit={submit} className="w-full max-w-xs">
        <input
          id="code"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="קוד גישה"
          className="composer-shell w-full px-5 py-3.5 text-center text-[1.05rem] text-ink outline-none placeholder:text-ink-3"
          aria-invalid={Boolean(error)}
        />
        <button type="submit" disabled={!code || busy} className="btn-primary mt-4 w-full rounded-full py-3.5 font-medium transition-opacity disabled:opacity-40">
          {busy ? "בודק…" : "כניסה"}
        </button>
        <p role="alert" className="mt-4 min-h-6 text-center text-[0.9rem] text-danger">
          {error}
        </p>
      </form>
    </main>
  );
}
