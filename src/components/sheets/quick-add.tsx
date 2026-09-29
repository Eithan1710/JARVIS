"use client";
import { BedDouble, BookOpenText, Briefcase, Dumbbell, Footprints, Repeat, Scale, Smile, SquarePlus, Wallet } from "lucide-react";
import { openSheet } from "@/client/store";
import { Sheet } from "../ui/sheet";

const ITEMS = [
  { label: "צ׳ק־אין", sub: "מצב רוח, אנרגיה, ריכוז", icon: Smile, action: () => openSheet("checkin") },
  { label: "שינה", sub: "שעות ושעת הירדמות", icon: BedDouble, action: () => openSheet({ kind: "metric", metricKey: "sleep_hours" }) },
  { label: "אימון", sub: "סוג ומשך", icon: Dumbbell, action: () => openSheet({ kind: "metric", metricKey: "workout_minutes" }) },
  { label: "הוצאה", sub: "סכום וקטגוריה", icon: Wallet, action: () => openSheet({ kind: "transaction" }) },
  { label: "רשומת יומן", sub: "מה קרה היום", icon: BookOpenText, action: () => openSheet({ kind: "journal" }) },
  { label: "עבודה", sub: "שעות עבודה", icon: Briefcase, action: () => openSheet({ kind: "metric", metricKey: "work_hours" }) },
  { label: "צעדים", sub: "מספר צעדים", icon: Footprints, action: () => openSheet({ kind: "metric", metricKey: "steps" }) },
  { label: "משקל", sub: "ק״ג", icon: Scale, action: () => openSheet({ kind: "metric", metricKey: "weight" }) },
  { label: "הרגל חדש", sub: "להתחיל לעקוב", icon: Repeat, action: () => openSheet({ kind: "habit-form" }) },
  { label: "נתון אחר", sub: "כל מדד", icon: SquarePlus, action: () => openSheet({ kind: "metric" }) },
];

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="מה להוסיף?" size="md">
      <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3">
        {ITEMS.map((it) => (
          <button key={it.label} onClick={it.action} className="flex min-h-[76px] flex-col items-start gap-1.5 rounded-2xl bg-surface-2 p-3.5 text-start ring-1 ring-line transition-colors hover:bg-sunken active:scale-[0.98]">
            <it.icon className="size-5 text-accent" strokeWidth={1.9} />
            <span className="text-[15px] font-medium leading-tight">{it.label}</span>
            <span className="text-xs text-muted">{it.sub}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
