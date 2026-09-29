"use client";
import { useEffect, useState } from "react";
import { Check, CircleSlash, Minus, X } from "lucide-react";
import { useHabits } from "@/client/queries";
import { useLogHabit } from "@/client/mutations";
import { formatDayTitle } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/field";

type Status = "completed" | "partial" | "missed" | "skipped";
const OPTIONS: { value: Status; label: string; icon: typeof Check; cls: string }[] = [
  { value: "completed", label: "בוצע", icon: Check, cls: "bg-accent text-accent-ink" },
  { value: "partial", label: "חלקית", icon: Minus, cls: "bg-accent-soft text-accent-strong" },
  { value: "skipped", label: "לא רלוונטי היום", icon: CircleSlash, cls: "bg-sunken text-ink" },
  { value: "missed", label: "לא בוצע", icon: X, cls: "bg-negative-soft text-negative" },
];

export function HabitLogSheet({ open, onOpenChange, habitId, date }: { open: boolean; onOpenChange: (o: boolean) => void; habitId: string; date: string }) {
  const { data: list } = useHabits(date || undefined);
  const s = list?.find((x) => x.habit.id === habitId);
  const current = s?.recent.find((r) => r.date === date) ?? (s?.today.date === date ? s.today : undefined);
  const [status, setStatus] = useState<Status | null>(null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const log = useLogHabit();

  useEffect(() => {
    if (!open) return;
    setStatus((current?.status as Status) ?? null);
    setValue(current?.value != null ? String(current.value) : "");
    setNote("");
  }, [open, current?.status, current?.value]);

  if (!s) return <Sheet open={open} onOpenChange={onOpenChange} title="טוען…"><div className="h-40" /></Sheet>;
  const quantity = s.habit.kind === "quantity";

  const submit = async (st: Status | null = status) => {
    await log.mutateAsync({ habitId, date, status: st, value: quantity && value ? Number(value) : null, note: note.trim() || null });
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={s.habit.name}
      description={formatDayTitle(date)}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button block size="lg" onClick={() => submit()} loading={log.isPending} disabled={!status && !value}>
            שמירה
          </Button>
          {current?.status ? (
            <Button size="lg" variant="subtle" onClick={() => submit(null)}>
              ניקוי
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        {quantity ? (
          <Field label={`כמה? ${s.habit.targetValue ? `(יעד: ${s.habit.targetValue} ${s.habit.unit ?? ""})` : ""}`} hint="הסטטוס ייקבע לפי היעד.">
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="num text-center text-2xl font-semibold" autoFocus />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setStatus(o.value)}
              aria-pressed={status === o.value}
              className={cn("flex h-14 items-center justify-center gap-2 rounded-2xl text-[15px] font-medium ring-1 ring-line transition-all", status === o.value ? o.cls + " ring-transparent" : "bg-surface text-ink-2")}
            >
              <o.icon className="size-4" />
              {o.label}
            </button>
          ))}
        </div>
        <Field label="הערה (לא חובה)">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: אימון קצר בגלל עומס" />
        </Field>
      </div>
    </Sheet>
  );
}
