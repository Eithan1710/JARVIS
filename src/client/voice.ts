"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "denied" | "unsupported";

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return undefined;
}

/**
 * Push-to-talk recorder. Exposes a live input level (0..1) so the core can react to the voice.
 * Works on iOS Safari (records audio/mp4) and Chromium (audio/webm).
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const started = useRef(0);
  const resolveStop = useRef<((b: Blob | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setLevel(0);
    setElapsed(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async (): Promise<"ok" | "denied" | "unsupported"> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      return "unsupported";
    }
    setState("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        const blob = chunks.current.length ? new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" }) : null;
        cleanup();
        resolveStop.current?.(blob);
        resolveStop.current = null;
      };
      rec.current = r;
      r.start(250);
      started.current = Date.now();

      // Level meter
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtx.current = ctx;
      const src = ctx.createMediaStreamSource(s);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const data = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
        setElapsed(Date.now() - started.current);
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      setState("recording");
      return "ok";
    } catch {
      cleanup();
      setState("denied");
      return "denied";
    }
  }, [cleanup]);

  /** Stop and return the recording (null when cancelled or empty). */
  const stop = useCallback((cancel = false): Promise<Blob | null> => {
    const r = rec.current;
    rec.current = null;
    setState("idle");
    if (!r || r.state === "inactive") {
      cleanup();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      resolveStop.current = cancel ? () => resolve(null) : resolve;
      r.stop();
    });
  }, [cleanup]);

  return { state, level, elapsed, start, stop, setState };
}
