"use client";
import { Check, CloudOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { sync } from "@/client/outbox";
import { useStore } from "@/client/store";
import { useOnline } from "@/client/hooks";
import { cn } from "@/lib/utils";

/** Always-honest sync state: saved on device vs synced to the server. */
export function SyncIndicator({ compact }: { compact?: boolean }) {
  const s = useStore(sync, (x) => x);
  const online = useOnline();
  const [justSynced, setJustSynced] = useState(false);
  useEffect(() => {
    if (!s.lastSyncedAt) return;
    setJustSynced(true);
    const t = setTimeout(() => setJustSynced(false), 2500);
    return () => clearTimeout(t);
  }, [s.lastSyncedAt]);

  let tone: "ok" | "pending" | "offline" | "syncing" = "ok";
  let text = "הכול מסונכרן";
  if (s.syncing) {
    tone = "syncing";
    text = "מסנכרן…";
  } else if (s.pending > 0) {
    tone = online ? "pending" : "offline";
    text = `${s.pending} ${s.pending === 1 ? "פעולה נשמרה" : "פעולות נשמרו"} במכשיר`;
  } else if (!online) {
    tone = "offline";
    text = "לא מחובר";
  } else if (justSynced) text = "סונכרן";

  if (compact) {
    if (tone === "ok" && !justSynced) return null;
    return (
      <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium", tone === "offline" || tone === "pending" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent-strong")} role="status">
        {tone === "syncing" ? <Loader2 className="size-3 animate-spin" /> : tone === "offline" || tone === "pending" ? <CloudOff className="size-3" /> : <Check className="size-3" />}
        {tone === "pending" || tone === "offline" ? (s.pending ? `${s.pending} ממתינות` : "לא מחובר") : text}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted" role="status">
      {tone === "syncing" ? <Loader2 className="size-3.5 animate-spin" /> : tone === "offline" || tone === "pending" ? <CloudOff className="size-3.5 text-warning" /> : <Check className="size-3.5 text-positive" />}
      <span>{text}</span>
    </div>
  );
}
