export type CoreState = "idle" | "thinking" | "listening";

/** The small JARVIS mark: a turning drop of light (header, inline status). */
export function Core({ state = "idle", size = 28, className }: { state?: CoreState; size?: number; level?: number; className?: string }) {
  return (
    <span
      className={`core ${className ?? ""}`}
      data-state={state}
      style={{ "--size": `${size}px` } as React.CSSProperties}
      role="img"
      aria-label={state === "thinking" ? "JARVIS חושב" : state === "listening" ? "JARVIS מקשיב" : "JARVIS"}
    />
  );
}
