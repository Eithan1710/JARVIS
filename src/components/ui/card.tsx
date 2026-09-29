"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, children, as: As = "section", ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <As className={cn("card", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, subtitle, action, href, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; href?: string; className?: string }) {
  const titleEl = (
    <div className="min-w-0">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5", className)}>
      {href ? (
        <Link href={href} className="group flex min-w-0 items-center gap-1">
          {titleEl}
          <ChevronLeft className="size-4 shrink-0 text-faint transition-transform group-hover:-translate-x-0.5" aria-hidden />
        </Link>
      ) : (
        titleEl
      )}
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 pb-4 pt-3 md:px-5 md:pb-5", className)}>{children}</div>;
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 mt-6 flex items-center justify-between px-1", className)}>
      <h2 className="text-[13px] font-semibold tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}
