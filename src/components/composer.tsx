"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  recording: boolean;
  transcribing: boolean;
  level: number;
  elapsed: number;
  onMic: () => void;
  onStopRecording: (send: boolean) => void;
  onCancelWork?: () => void;
  notice?: string | null;
}

export function Composer(p: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [p.value]);

  useEffect(() => {
    const focus = () => ref.current?.focus();
    window.addEventListener("jarvis:focus-composer", focus);
    return () => window.removeEventListener("jarvis:focus-composer", focus);
  }, []);

  const hasText = p.value.trim().length > 0;
  const seconds = Math.floor(p.elapsed / 1000);

  return (
    <div className="mx-auto w-full max-w-[var(--column)] px-3 sm:px-4">
      {p.notice && <div className="status-line mb-2 text-center text-[0.85rem] text-mist">{p.notice}</div>}
      <div className="composer flex items-end gap-1.5 rounded-[26px] p-1.5 ps-4">
        {p.recording ? (
          <div className="flex min-h-11 flex-1 items-center gap-3" aria-live="polite">
            <span className="size-2 animate-pulse rounded-full bg-ember" />
            <div className="flex h-6 flex-1 items-center justify-center gap-[3px]" aria-hidden>
              {Array.from({ length: 24 }, (_, i) => {
                const wave = Math.sin((i / 23) * Math.PI);
                const h = 0.15 + Math.min(1, p.level * (0.6 + wave)) * 0.85;
                return <span key={i} className="level-bar w-[3px] rounded-full bg-pearl-2" style={{ height: "100%", transform: `scaleY(${h.toFixed(3)})`, opacity: 0.35 + wave * 0.5 }} />;
              })}
            </div>
            <span className="w-10 text-[0.85rem] tabular-nums text-mist" dir="ltr">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
          </div>
        ) : p.transcribing ? (
          <div className="flex min-h-11 flex-1 items-center">
            <span className="shimmer text-[1rem]">מקשיב למה שאמרת…</span>
          </div>
        ) : (
          <textarea
            ref={ref}
            rows={1}
            value={p.value}
            onChange={(e) => p.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (hasText && !p.busy) p.onSend();
              }
            }}
            placeholder="דבר איתי…"
            aria-label="הודעה ל־JARVIS"
            className="max-h-[168px] min-h-11 flex-1 py-2.5"
            enterKeyHint="send"
            dir="auto"
          />
        )}

        {p.recording ? (
          <>
            <button type="button" onClick={() => p.onStopRecording(false)} className="grid size-11 place-items-center rounded-full text-mist hover:text-pearl" aria-label="בטל הקלטה">
              <Icon name="x" size={20} />
            </button>
            <button type="button" onClick={() => p.onStopRecording(true)} className="grid size-11 place-items-center rounded-full bg-pearl text-abyss" aria-label="שלח הקלטה">
              <Icon name="send" size={20} strokeWidth={2} />
            </button>
          </>
        ) : p.busy && !hasText ? (
          <button type="button" onClick={p.onCancelWork} className="grid size-11 place-items-center rounded-full border border-line text-pearl" aria-label="עצור">
            <Icon name="stop" size={16} />
          </button>
        ) : hasText ? (
          <button
            type="button"
            onClick={p.onSend}
            disabled={p.busy}
            className="grid size-11 place-items-center rounded-full bg-pearl text-abyss transition-opacity disabled:opacity-40"
            aria-label="שלח"
          >
            <Icon name="send" size={20} strokeWidth={2} />
          </button>
        ) : (
          <button
            type="button"
            onClick={p.onMic}
            disabled={p.transcribing}
            className="grid size-11 place-items-center rounded-full text-pearl-2 transition-colors hover:bg-veil-2 hover:text-pearl disabled:opacity-40"
            aria-label="דבר"
          >
            <Icon name="mic" size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
