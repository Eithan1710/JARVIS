"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Plus, Search } from "lucide-react";
import { Suspense, useEffect } from "react";
import { cn } from "@/lib/utils";
import { openSheet } from "@/client/store";
import { useIsClient, useKeyboardOpen } from "@/client/hooks";
import { useNotifications } from "@/client/queries";
import { MORE_ROUTES, MOBILE_NAV, NAV, isActive, pageTitle } from "./nav";
import { SyncIndicator } from "./sync-indicator";
import { SheetHost } from "../sheets/sheet-host";
import { Logo } from "./logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const keyboard = useKeyboardOpen();
  // Page content depends on the device cache (IndexedDB), which only exists in the browser.
  // Rendering it after mount avoids hydration mismatches; the shell itself is still server-rendered.
  const isClient = useIsClient();
  const { data: notifications } = useNotifications();
  const unread = (notifications ?? []).filter((n) => n.status === "sent" && !n.readAt).length;

  // Warm the offline page cache once the user is inside the app.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: "WARM" })).catch(() => {});
  }, []);

  // Desktop keyboard shortcuts: "/" or ⌘K → Ask, "n" → quick add, "c" → check-in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        e.preventDefault();
        router.push("/ask");
      } else if (e.key === "n" && !e.metaKey && !e.ctrlKey) openSheet("quick-add");
      else if (e.key === "c" && !e.metaKey && !e.ctrlKey) openSheet("checkin");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const title = pageTitle(pathname);
  const isChat = pathname.startsWith("/ask");

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar: rail on tablets, full on desktop. Sits on the right (start) in RTL. */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-surface-2 md:flex md:w-[76px] lg:w-[248px]">
        <div className="flex h-16 items-center gap-2.5 px-5 lg:px-6">
          <Logo className="size-8 shrink-0" />
          <span className="hidden text-[17px] font-semibold tracking-tight lg:inline">NOVA</span>
        </div>
        <nav className="scroll-area flex-1 overflow-y-auto px-3 pb-3" aria-label="ניווט ראשי">
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === "main").map((n) => (
              <SideLink key={n.href} item={n} active={isActive(pathname, n.href)} />
            ))}
          </ul>
          <div className="mx-3 my-3 h-px bg-line" />
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === "system").map((n) => (
              <SideLink key={n.href} item={n} active={isActive(pathname, n.href)} />
            ))}
          </ul>
        </nav>
        <div className="border-t border-line p-3">
          <button onClick={() => openSheet("quick-add")} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-ink hover:bg-accent-strong lg:justify-start lg:px-4" title="הוספה מהירה (N)">
            <Plus className="size-5" />
            <span className="hidden lg:inline">הוספה מהירה</span>
          </button>
          <div className="mt-2 hidden lg:block">
            <SyncIndicator />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="pt-safe sticky top-0 z-30 border-b border-transparent bg-bg/85 backdrop-blur-xl md:hidden">
          <div className="flex h-13 min-h-[52px] items-center justify-between gap-2 px-3">
            <div className="flex min-w-0 items-center gap-2 ps-1">
              <span className="truncate text-[17px] font-semibold">{title}</span>
              <SyncIndicator compact />
            </div>
            <div className="flex items-center">
              <button onClick={() => openSheet("notifications")} className="relative grid size-11 place-items-center rounded-full text-ink-2 active:bg-sunken" aria-label="התראות">
                <Bell className="size-[22px]" strokeWidth={1.8} />
                {unread ? <span className="absolute end-2.5 top-2.5 size-2 rounded-full bg-negative" /> : null}
              </button>
              <button onClick={() => openSheet("quick-add")} className="grid size-11 place-items-center rounded-full text-accent active:bg-sunken" aria-label="הוספה מהירה">
                <Plus className="size-6" strokeWidth={2} />
              </button>
            </div>
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-between gap-4 border-b border-line bg-bg/85 px-6 backdrop-blur-xl md:flex lg:px-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="flex items-center gap-2">
            <Link href="/ask" className="flex h-10 w-[min(36vw,380px)] items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm text-faint hover:border-line-strong">
              <Search className="size-4" />
              <span className="flex-1">שאל משהו על עצמך…</span>
              <kbd className="ltr rounded-md bg-sunken px-1.5 py-0.5 text-[11px] text-muted">⌘K</kbd>
            </Link>
            <button onClick={() => openSheet("checkin")} className="h-10 rounded-xl px-3.5 text-sm font-medium text-ink-2 hover:bg-sunken" title="צ׳ק־אין (C)">
              צ׳ק־אין
            </button>
            <button onClick={() => openSheet("notifications")} className="relative grid size-10 place-items-center rounded-xl text-ink-2 hover:bg-sunken" aria-label="התראות">
              <Bell className="size-5" strokeWidth={1.8} />
              {unread ? <span className="absolute end-2 top-2 size-2 rounded-full bg-negative" /> : null}
            </button>
          </div>
        </header>

        <main className={cn("mx-auto w-full min-w-0 flex-1", isChat ? "max-w-none" : "max-w-[1240px] px-4 pt-3 md:px-6 md:pt-6 lg:px-8", !isChat && "pb-nav md:pb-12")}>
          <Suspense fallback={null}>{isClient ? children : <PageSkeleton />}</Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="ניווט"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[var(--safe-bottom)] backdrop-blur-xl transition-transform md:hidden",
          keyboard && "translate-y-full",
        )}
      >
        <ul className="mx-auto grid h-[var(--nav-h)] max-w-md grid-cols-5">
          {MOBILE_NAV.map((n) => {
            const active = n.href === "/more" ? MORE_ROUTES.some((r) => isActive(pathname, r)) : isActive(pathname, n.href);
            const Icon = n.icon;
            return (
              <li key={n.href}>
                <Link href={n.href} className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-accent" : "text-muted")} aria-current={active ? "page" : undefined}>
                  <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <SheetHost />
    </div>
  );
}

function SideLink({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        title={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors md:justify-center lg:justify-start",
          active ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:bg-sunken",
        )}
      >
        <Icon className={cn("size-[19px] shrink-0", active ? "text-accent" : "text-muted")} strokeWidth={active ? 2.1 : 1.8} />
        <span className="hidden truncate lg:inline">{item.label}</span>
      </Link>
    </li>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-4 w-64" />
      <div className="skeleton h-40 w-full rounded-[18px]" />
      <div className="skeleton h-64 w-full rounded-[18px]" />
    </div>
  );
}
