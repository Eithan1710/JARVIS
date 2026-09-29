import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "positive" | "negative" | "warning" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent-strong",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, expected, tone = "accent", className, label }: { value: number | null; expected?: number | null; tone?: "accent" | "positive" | "warning" | "negative"; className?: string; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100);
  const color = { accent: "bg-accent", positive: "bg-positive", warning: "bg-warning", negative: "bg-negative" }[tone];
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-sunken", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("absolute inset-y-0 start-0 rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
      {expected != null ? <div className="absolute inset-y-[-2px] w-0.5 rounded bg-ink/40" style={{ insetInlineStart: `${Math.round(expected * 100)}%` }} title="הקצב הצפוי" /> : null}
    </div>
  );
}

export function Ring({ value, size = 44, stroke = 5, children, className }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 scale-x-[-1]" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 500ms ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function EmptyState({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {body ? <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-8 text-center">
      <p className="text-[15px] font-medium">לא הצלחנו לטעון את המידע</p>
      <p className="mt-1 text-sm text-muted">{message ?? "בדוק את החיבור ונסה שוב."}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-4 rounded-xl bg-sunken px-4 py-2 text-sm font-medium hover:bg-line">
          נסה שוב
        </button>
      ) : null}
    </div>
  );
}

export function Stat({ label, value, sub, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "positive" | "negative" | null; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate text-[13px] text-muted">{label}</div>
      <div className="num mt-0.5 truncate text-[22px] font-semibold leading-tight tracking-tight">{value}</div>
      {sub ? <div className={cn("mt-0.5 truncate text-xs", tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-muted")}>{sub}</div> : null}
    </div>
  );
}
