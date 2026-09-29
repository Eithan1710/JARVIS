"use client";
import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { useStandalone } from "@/client/hooks";
import { Logo } from "../layout/logo";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** A quiet, dismissible install suggestion — never a modal, never repeated after dismissal. */
export function InstallHint() {
  const standalone = useStandalone();
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("nova-install-dismissed") === "1");
    } catch {
      setDismissed(false);
    }
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent));
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (standalone || dismissed || (!bip && !ios)) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("nova-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <Logo className="size-10 shrink-0" />
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <div className="text-[14px] font-medium">אפשר להתקין את NOVA</div>
        {ios ? (
          <span className="text-muted">
            בספארי: <Share className="inline size-3.5 align-[-2px]" /> ← „הוספה למסך הבית”
          </span>
        ) : (
          <span className="text-muted">נפתחת מהר יותר, במסך מלא, עם התראות.</span>
        )}
      </div>
      {bip ? (
        <button
          onClick={async () => {
            await bip.prompt();
            await bip.userChoice;
            setBip(null);
          }}
          className="shrink-0 rounded-xl bg-accent px-3 py-2 text-[13px] font-medium text-accent-ink"
        >
          התקנה
        </button>
      ) : null}
      <button onClick={dismiss} className="grid size-8 shrink-0 place-items-center rounded-full text-faint hover:bg-sunken" aria-label="לא עכשיו">
        <X className="size-4" />
      </button>
    </div>
  );
}
