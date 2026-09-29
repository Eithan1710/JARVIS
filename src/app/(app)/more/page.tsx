"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { NAV } from "@/components/layout/nav";
import { Card } from "@/components/ui/card";
import { SyncIndicator } from "@/components/layout/sync-indicator";
import { InstallHint } from "@/components/features/install-hint";

const HIDE = new Set(["/", "/today", "/insights", "/ask"]);
const DESCRIPTIONS: Record<string, string> = {
  "/timeline": "כל מה שנרשם, יום אחרי יום",
  "/habits": "היסטוריה, רצפים ועקביות",
  "/goals": "יעדים והקשר שלהם להרגלים",
  "/journal": "מחשבות ואירועים במילים שלך",
  "/experiments": "לשנות דבר אחד ולבדוק מה קרה",
  "/data": "כל הנתונים, לפי נושא ומקור",
  "/integrations": "Apple Health, יומן, קבצים ועוד",
  "/memory": "מה ש־NOVA זוכרת עליך",
  "/settings": "התראות, פרטיות ו־AI",
};

export default function MorePage() {
  const groups = [NAV.filter((n) => n.group === "main" && !HIDE.has(n.href)), NAV.filter((n) => n.group === "system")];
  return (
    <div className="animate-fade-in space-y-5">
      <InstallHint />
      {groups.map((g, i) => (
        <Card key={i} className="divide-y divide-line overflow-hidden">
          {g.map((n) => (
            <Link key={n.href} href={n.href} className="flex min-h-[60px] items-center gap-3.5 px-4 py-3 active:bg-sunken">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <n.icon className="size-[18px]" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{n.label}</span>
                <span className="block truncate text-[13px] text-muted">{DESCRIPTIONS[n.href]}</span>
              </span>
              <ChevronLeft className="size-5 shrink-0 text-faint" />
            </Link>
          ))}
        </Card>
      ))}
      <div className="flex justify-center pb-2">
        <SyncIndicator />
      </div>
    </div>
  );
}
