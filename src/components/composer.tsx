"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  transcribing: boolean;
  onMic: () => void;
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

  return (
    <div className="mx-auto w-full max-w-[var(--column)] px-3 sm:px-4">
      {p.notice && (
        <div className="rise mx-auto mb-2.5 w-fit max-w-full rounded-full glass px-4 py-1.5 text-center text-[0.85rem] text-ink-2" role="status">
          {p.notice}
        </div>
      )}
      <div className="composer-shell flex items-end gap-2 p-2 ps-5">
        {p.transcribing ? (
          <div className="flex min-h-12 flex-1 items-center">
            <span className="shimmer text-[1.0625rem]">מתמלל את מה שאמרת…</span>
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
            placeholder="מה תרצה לעשות?"
            aria-label="הודעה ל־JARVIS"
            className="max-h-[168px] min-h-12 flex-1 py-3"
            enterKeyHint="send"
            dir="auto"
          />
        )}

        {p.busy && !hasText ? (
          <button type="button" onClick={p.onCancelWork} className="grid size-12 shrink-0 place-items-center rounded-full border border-line-2 bg-glass-2 text-ink" aria-label="עצור">
            <Icon name="stop" size={16} />
          </button>
        ) : hasText ? (
          <button type="button" onClick={p.onSend} disabled={p.busy} className="send-btn grid size-12 shrink-0 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-40" aria-label="שלח">
            <Icon name="send" size={22} strokeWidth={2.2} />
          </button>
        ) : (
          <button
            type="button"
            onClick={p.onMic}
            disabled={p.transcribing}
            className="mic-btn grid size-12 shrink-0 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-40"
            aria-label="דבר עם JARVIS"
          >
            <Icon name="mic" size={23} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
