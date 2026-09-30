export type CoreState = "idle" | "thinking" | "listening";

/** JARVIS's presence: a breathing ring of light that reacts to what's happening. */
export function Core({ state = "idle", size = 132, level = 0, className }: { state?: CoreState; size?: number; level?: number; className?: string }) {
  return (
    <div
      className={`core ${className ?? ""}`}
      data-state={state}
      style={{ "--size": `${size}px`, "--level": level.toFixed(3) } as React.CSSProperties}
      role="img"
      aria-label={state === "thinking" ? "JARVIS חושב" : state === "listening" ? "JARVIS מקשיב" : "JARVIS"}
    >
      <span className="core-ring" />
      <span className="core-ring inner" />
      <span className="core-heart" />
    </div>
  );
}
