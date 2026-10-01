"use client";
import { Icon } from "./icons";
import { Orb } from "./orb";

/** Full-screen voice mode: the orb listens and breathes with your voice. */
export function VoiceOverlay({ level, elapsed, onCancel, onSend }: { level: number; elapsed: number; onCancel: () => void; onSend: () => void }) {
  const s = Math.floor(elapsed / 1000);
  return (
    <div className="voice-overlay fixed inset-0 z-50 flex flex-col items-center justify-between px-6" style={{ paddingTop: "calc(var(--safe-top) + 4rem)", paddingBottom: "calc(var(--safe-bottom) + 2.5rem)" }} role="dialog" aria-label="מצב קולי">
      <div className="text-center">
        <p className="display gradient-text text-[3.6rem] sm:text-[4.5rem]">מקשיב</p>
        <p className="mt-3 text-[0.95rem] text-ink-3 tabular-nums" dir="ltr">
          {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
        </p>
      </div>
      <Orb size={300} state="listening" level={level} />
      <div className="flex w-full max-w-xs items-center justify-between">
        <button type="button" onClick={onCancel} className="glass grid size-16 place-items-center rounded-full text-ink-2 transition-transform active:scale-95" aria-label="בטל">
          <Icon name="x" size={26} />
        </button>
        <p className="text-[0.85rem] text-ink-3">דבר חופשי, ואז שלח</p>
        <button type="button" onClick={onSend} className="btn-primary grid size-16 place-items-center rounded-full transition-transform active:scale-95" aria-label="שלח">
          <Icon name="send" size={26} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
