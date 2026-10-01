import { Core } from "@/components/core";

export default function Offline() {
  return (
    <main className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <Core size={64} className="mb-8" />
      <h1 className="display text-5xl text-ink">אין חיבור לרשת</h1>
      <p className="mt-3 text-ink-2">JARVIS יחזור ברגע שהחיבור יחזור.</p>
    </main>
  );
}
