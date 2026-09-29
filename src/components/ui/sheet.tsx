"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Desktop width. */
  size?: "sm" | "md" | "lg";
  /** Full-height on mobile (e.g. forms with keyboards, long content). */
  tall?: boolean;
}

/**
 * One component, two native-feeling presentations:
 *  - phones: a bottom sheet with a drag handle (swipe down to dismiss), safe-area and keyboard aware
 *  - tablets/desktop: a centered dialog
 */
export function Sheet({ open, onOpenChange, title, description, children, footer, size = "md", tall }: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !contentRef.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    contentRef.current.style.transform = `translateY(${drag.current.dy}px)`;
    contentRef.current.style.transition = "none";
  };
  const onPointerUp = () => {
    if (!drag.current || !contentRef.current) return;
    const { dy } = drag.current;
    contentRef.current.style.transition = "transform 200ms ease-out";
    contentRef.current.style.transform = "";
    drag.current = null;
    if (dy > 90) onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content
          ref={contentRef}
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed z-50 flex flex-col bg-elevated text-ink shadow-float outline-none",
            // phone: bottom sheet
            "inset-x-0 bottom-[var(--kb)] rounded-t-[26px] data-[state=open]:animate-sheet-up",
            tall ? "h-[calc(100dvh-var(--kb)-var(--safe-top)-12px)]" : "max-h-[calc(100dvh-var(--kb)-var(--safe-top)-12px)]",
            // tablet+: centered dialog
            "md:inset-auto md:bottom-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[min(86dvh,820px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:data-[state=open]:animate-pop",
            size === "sm" ? "md:w-[420px]" : size === "lg" ? "md:w-[720px]" : "md:w-[540px]",
          )}
        >
          <div className="shrink-0 touch-none md:hidden" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
          </div>
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-3 md:px-6 md:pt-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold leading-tight">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="-me-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken" aria-label="סגירה">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 md:px-6">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-line px-5 pb-[max(12px,var(--safe-bottom))] pt-3 md:px-6 md:pb-5">{footer}</div>
          ) : (
            <div className="shrink-0 pb-[var(--safe-bottom)]" />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
