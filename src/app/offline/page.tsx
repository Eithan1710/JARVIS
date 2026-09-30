import { Core } from "@/components/core";

export default function Offline() {
  return (
    <main className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <Core size={96} className="mb-8" />
      <h1 className="font-serif text-2xl text-pearl">אין חיבור לרשת</h1>
      <p className="mt-3 text-mist">JARVIS יחזור ברגע שהחיבור יחזור.</p>
    </main>
  );
}
