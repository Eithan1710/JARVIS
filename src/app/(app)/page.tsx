"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpLeft, BedDouble, CalendarClock, Footprints, MessageCircle, Smile, Sparkle, Target } from "lucide-react";
import { useDashboard, type Dashboard } from "@/client/queries";
import { openSheet } from "@/client/store";
import { useAction } from "@/client/mutations";
import { api } from "@/client/api";
import { formatDayTitle, formatDuration, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, ProgressBar, Ring, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/field";
import { HabitRow } from "@/components/features/habit-row";
import { InsightCard } from "@/components/features/insight";
import { DailyBrief } from "@/components/features/daily-brief";
import { TrendChart } from "@/components/charts";

export default function HomePage() {
  const { data, isLoading, error, refetch } = useDashboard();
  if (isLoading && !data) return <HomeSkeleton />;
  if (error && !data) return <ErrorState onRetry={() => refetch()} />;
  if (!data) return null;
  const fresh = !data.habits.length && !data.hasDemoData && !data.insights.length;
  return (
    <div className="animate-fade-in">
      <Greeting d={data} />
      {fresh ? <Welcome /> : null}
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-8">
          <DailyBrief date={data.today} aiConfigured={data.aiConfigured} />
          <TodayHabits d={data} />
          <Snapshot d={data} />
          <div className="hidden lg:block">
            <Trends d={data} />
          </div>
        </div>
        {/* Context column (left in RTL) */}
        <div className="space-y-4 lg:col-span-4">
          {!data.checkin ? <CheckinPrompt /> : <CheckinSummary d={data} />}
          <AskBox />
          {data.insights[0] ? (
            <div>
              <SectionTitle action={<Link href="/insights" className="text-sm text-accent">הכול</Link>}>נקודה מעניינת</SectionTitle>
              <InsightCard i={data.insights[0]} compact />
            </div>
          ) : null}
          <Upcoming d={data} />
          <Goals d={data} />
          <div className="lg:hidden">
            <Trends d={data} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Greeting({ d }: { d: Dashboard }) {
  const y = d.yesterday;
  return (
    <div className="mb-4 px-1 md:mb-6">
      <h1 className="text-display font-semibold tracking-tight md:text-[2rem]">
        {d.greeting}
        {d.displayName ? `, ${d.displayName}` : ""}
      </h1>
      <p className="mt-1 text-[15px] text-muted">
        {formatDayTitle(d.today)}
        {y?.habitsDue ? (
          <>
            {" · "}
            אתמול השלמת <span className="num font-medium text-ink-2">{formatNumber(y.habitsDone, 1)}</span> מתוך <span className="num font-medium text-ink-2">{y.habitsDue}</span> הרגלים
          </>
        ) : null}
      </p>
    </div>
  );
}

function Welcome() {
  const demo = useAction(() => api.post("/api/demo"), { success: "נטענו נתוני דוגמה של 100 ימים" });
  return (
    <Card className="mb-4 overflow-hidden p-5 md:p-6">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Sparkle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">ברוך הבא ל־NOVA</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-muted">
            המערכת לומדת ממה שקורה בפועל: הרגלים, שינה, אימונים, מצב רוח ועוד. ככל שיש יותר היסטוריה, התובנות נעשות מדויקות יותר. אפשר להתחיל מהרגל אחד, או לראות איך זה נראה עם נתוני דוגמה.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => openSheet({ kind: "habit-form" })}>הרגל ראשון</Button>
            <Button variant="secondary" onClick={() => openSheet("checkin")}>
              צ׳ק־אין ראשון
            </Button>
            <Button variant="ghost" onClick={() => demo.mutate(undefined)} loading={demo.isPending}>
              טען נתוני דוגמה
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TodayHabits({ d }: { d: Dashboard }) {
  const due = d.habits.filter((h) => h.today.scheduled || h.frequency === "weekly_count");
  if (!d.habits.length) return null;
  const counted = due.filter((h) => h.frequency !== "weekly_count");
  const done = counted.filter((h) => h.today.status === "completed" || h.today.status === "partial").length;
  const main = due.filter((h) => h.tier === "main");
  const side = due.filter((h) => h.tier === "side");
  return (
    <Card>
      <CardHeader
        title="היום"
        subtitle={counted.length ? (done === counted.length ? "הכול הושלם להיום 🎉" : `${done} מתוך ${counted.length} הושלמו`) : "אין הרגלים מתוכננים להיום"}
        href="/today"
        action={
          counted.length ? (
            <Ring value={counted.length ? done / counted.length : 0} size={46}>
              <span className="num text-xs font-semibold">
                {done}/{counted.length}
              </span>
            </Ring>
          ) : null
        }
      />
      <CardBody className="pt-1">
        {main.length ? (
          <div className="divide-y divide-line">
            {main.map((h) => (
              <HabitRow key={h.id} h={h} date={d.today} />
            ))}
          </div>
        ) : null}
        {side.length ? (
          <>
            {main.length ? <div className="mb-1 mt-3 text-xs font-medium text-muted">הרגלים יומיים</div> : null}
            <div className="grid gap-x-6 divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
              {side.map((h) => (
                <HabitRow key={h.id} h={h} date={d.today} dense />
              ))}
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Snapshot({ d }: { d: Dashboard }) {
  const tiles = [
    {
      label: "שינה בלילה",
      icon: BedDouble,
      value: d.todayValues.sleep != null ? formatDuration(d.todayValues.sleep) : null,
      onAdd: () => openSheet({ kind: "metric", metricKey: "sleep_hours" }),
      series: d.trends.sleep,
    },
    {
      label: "צעדים היום",
      icon: Footprints,
      value: d.todayValues.steps != null ? formatNumber(d.todayValues.steps, 0) : null,
      onAdd: () => openSheet({ kind: "metric", metricKey: "steps" }),
      series: d.trends.steps,
    },
    {
      label: "מצב רוח",
      icon: Smile,
      value: d.checkin?.mood != null ? `${d.checkin.mood}/10` : null,
      onAdd: () => openSheet("checkin"),
      series: d.trends.mood,
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 md:gap-4">
      {tiles.map((t) => (
        <button key={t.label} onClick={t.onAdd} className="card flex min-h-[92px] flex-col items-start justify-between p-3 text-start md:p-4">
          <div className="flex w-full items-center justify-between gap-1 text-muted">
            <span className="truncate text-[12px] md:text-[13px]">{t.label}</span>
            <t.icon className="size-4 shrink-0" strokeWidth={1.8} />
          </div>
          {t.value ? <div className="num mt-2 text-[19px] font-semibold leading-tight md:text-[22px]">{t.value}</div> : <div className="mt-2 text-sm font-medium text-accent">+ הוספה</div>}
        </button>
      ))}
    </div>
  );
}

function CheckinPrompt() {
  return (
    <button onClick={() => openSheet("checkin")} className="card flex w-full items-center gap-3 p-4 text-start transition-shadow hover:shadow-float">
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Smile className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">איך אתה מרגיש היום?</div>
        <div className="text-[13px] text-muted">צ׳ק־אין של חצי דקה</div>
      </div>
      <ArrowUpLeft className="size-5 text-faint" />
    </button>
  );
}

function CheckinSummary({ d }: { d: Dashboard }) {
  const c = d.checkin!;
  const items = [
    ["מצב רוח", c.mood],
    ["אנרגיה", c.energy],
    ["ריכוז", c.focus],
  ] as const;
  return (
    <button onClick={() => openSheet("checkin")} className="card w-full p-4 text-start">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[15px] font-semibold">הצ׳ק־אין של היום</span>
        <span className="text-xs text-accent">עריכה</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {items.map(([l, v]) => (
          <div key={l}>
            <div className="text-xs text-muted">{l}</div>
            <div className="num mt-0.5 text-lg font-semibold">{v ?? "—"}</div>
            <ProgressBar value={v != null ? v / 10 : 0} className="mt-1 h-1.5" />
          </div>
        ))}
      </div>
    </button>
  );
}

function AskBox() {
  const qs = ["מתי אני הכי מרוכז?", "מה השתנה בחודש האחרון?", "למה אני פחות עקבי עם אימונים?"];
  return (
    <Card className="p-4">
      <Link href="/ask" className="flex h-12 items-center gap-2.5 rounded-xl bg-sunken px-3.5 text-[15px] text-muted">
        <MessageCircle className="size-5 text-accent" />
        שאל משהו על עצמך…
      </Link>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {qs.map((q) => (
          <Link key={q} href={`/ask?q=${encodeURIComponent(q)}`} className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] text-ink-2 ring-1 ring-line hover:bg-sunken">
            {q}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function Upcoming({ d }: { d: Dashboard }) {
  const fmt = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const todayEvents = d.events.filter((e) => e.startAt.slice(0, 10) >= d.today).slice(0, 4);
  if (!todayEvents.length && !d.reminders.length) return null;
  return (
    <Card>
      <CardHeader title="בהמשך" />
      <CardBody className="space-y-2.5">
        {todayEvents.map((e) => (
          <div key={e.id} className="flex items-center gap-3 text-sm">
            <span className="num w-12 shrink-0 text-muted">{e.allDay ? "כל היום" : fmt.format(new Date(e.startAt))}</span>
            <span className="truncate">{e.title}</span>
          </div>
        ))}
        {d.reminders.map((r) => (
          <div key={r.id} className="flex items-center gap-3 text-sm">
            <span className="num w-12 shrink-0 text-muted">{fmt.format(new Date(r.scheduledFor))}</span>
            <span className="flex min-w-0 items-center gap-1.5 truncate text-ink-2">
              <CalendarClock className="size-3.5 shrink-0 text-accent" /> תזכורת: {r.title}
            </span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function Goals({ d }: { d: Dashboard }) {
  if (!d.goals.length) return null;
  return (
    <Card>
      <CardHeader title="מטרות" href="/goals" />
      <CardBody className="space-y-4">
        {d.goals.map((g) => (
          <Link key={g.id} href={`/goals/${g.id}`} className="block">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-medium">
                <Target className="size-3.5 shrink-0 text-accent" />
                {g.title}
              </span>
              {g.daysLeft != null ? <span className="num shrink-0 text-xs text-muted">{g.daysLeft >= 0 ? `עוד ${g.daysLeft} ימים` : "הדדליין עבר"}</span> : null}
            </div>
            <ProgressBar value={g.progress} expected={g.expected} tone={g.expected != null && g.progress != null && g.progress + 0.1 < g.expected ? "warning" : "accent"} />
            <div className="mt-1 text-xs text-muted">{g.progressLabel}</div>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

function Trends({ d }: { d: Dashboard }) {
  const [k, setK] = useState<"habitRate" | "sleep" | "mood" | "energy">("habitRate");
  const format = k === "habitRate" ? "percent" : k === "sleep" ? "hours" : "score";
  const labels = { habitRate: "השלמת הרגלים", sleep: "שינה", mood: "מצב רוח", energy: "אנרגיה" };
  return (
    <Card>
      <CardHeader title="שבועיים אחרונים" href="/timeline" />
      <CardBody>
        <Segmented
          size="sm"
          value={k}
          onChange={setK}
          className={cn("mb-3 w-full md:w-auto")}
          options={(Object.keys(labels) as (keyof typeof labels)[]).map((x) => ({ value: x, label: labels[x] }))}
        />
        <TrendChart points={d.trends[k].map((p) => ({ x: p.date, y: p.value }))} format={format} kind={k === "habitRate" ? "bar" : "line"} height={200} label={labels[k]} />
      </CardBody>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-28 w-full rounded-[18px]" />
      <Skeleton className="h-64 w-full rounded-[18px]" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-24 rounded-[18px]" />
        <Skeleton className="h-24 rounded-[18px]" />
        <Skeleton className="h-24 rounded-[18px]" />
      </div>
    </div>
  );
}
