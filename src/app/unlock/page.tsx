"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

function UnlockForm() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j?.error?.message ?? "הקוד שגוי");
        setCode("");
        return;
      }
      const next = params.get("next");
      location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch {
      setErr("אין חיבור לשרת");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="w-full max-w-xs space-y-3">
      <Input type="password" inputMode="text" autoComplete="current-password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="קוד גישה" className="text-center text-lg tracking-widest" aria-label="קוד גישה" />
      {err ? <p className="text-center text-sm text-negative">{err}</p> : null}
      <Button type="submit" block size="lg" loading={busy} disabled={!code}>
        <Lock className="size-4" /> כניסה
      </Button>
    </form>
  );
}

export default function UnlockPage() {
  return (
    <main className="pt-safe flex min-h-dvh flex-col items-center justify-center px-6">
      <Logo className="size-16" />
      <h1 className="mt-5 text-2xl font-semibold">NOVA</h1>
      <p className="mb-8 mt-1 text-[15px] text-muted">המרחב הפרטי שלך</p>
      <Suspense>
        <UnlockForm />
      </Suspense>
    </main>
  );
}
