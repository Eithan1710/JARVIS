"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, error, children, className, htmlFor }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-2">
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-sm text-negative">{error}</p> : hint ? <p className="text-[13px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-ink placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputBase, "h-12", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, "min-h-[96px] py-3 leading-relaxed", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, "h-12 appearance-none bg-[length:16px] bg-[left_12px_center] bg-no-repeat pe-3.5 ps-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Switch({ checked, onCheckedChange, label, description, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[15px] text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span> : null}
      </label>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="relative h-[30px] w-[50px] shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50"
        dir="rtl"
      >
        <SwitchPrimitive.Thumb className="block size-[26px] translate-x-[-2px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[-22px]" />
      </SwitchPrimitive.Root>
    </div>
  );
}

/** Pill-style segmented control / tabs. */
export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-xl bg-sunken p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-[10px] font-medium transition-all",
            size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1–10 picker sized for thumbs; selected value is announced. */
export function ScorePicker({ value, onChange, label, lowLabel, highLabel }: { value: number | null; onChange: (v: number | null) => void; label: string; lowLabel?: string; highLabel?: string }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="num text-sm text-muted">{value ?? "—"}/10</span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}`}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              "num h-10 rounded-lg text-sm font-medium transition-all active:scale-95",
              value === n ? "bg-accent text-accent-ink" : value != null && n < value ? "bg-accent-soft text-accent-strong" : "bg-sunken text-ink-2 hover:bg-line",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {lowLabel || highLabel ? (
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors",
        active ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-surface text-ink-2 hover:border-line-strong",
        className,
      )}
    >
      {children}
    </button>
  );
}
