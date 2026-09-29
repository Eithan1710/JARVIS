import { Logo } from "@/components/layout/logo";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="pt-safe flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo className="size-14" />
      <h1 className="mt-5 text-xl font-semibold">אין חיבור לאינטרנט</h1>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">המסך הזה עוד לא נשמר במכשיר. מסכים שכבר פתחת זמינים גם בלי חיבור, וכל מה שתסמן יסונכרן כשהחיבור יחזור.</p>
      <a href="/" className="mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-accent-ink">
        לנסות שוב
      </a>
    </main>
  );
}
