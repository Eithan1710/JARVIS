"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, ShieldCheck } from "lucide-react";
import { useDemo, useSettings, useSystem } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { api } from "@/client/api";
import { usePush } from "@/client/push";
import { useStandalone } from "@/client/hooks";
import { clearPersistedCache } from "@/client/query";
import type { Settings } from "@/lib/settings";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Select, Switch } from "@/components/ui/field";
import { Badge, ErrorState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";

type Patch = { displayName?: string; timezone?: string; settings?: { notifications?: Partial<Settings["notifications"]>; ai?: Partial<Settings["ai"]>; proactivity?: Settings["proactivity"] } };

const TIMEZONES = ["Asia/Jerusalem", "Asia/Nicosia", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "UTC"];

export default function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings();
  const { data: sys } = useSystem();
  const router = useRouter();
  const save = useAction((p: Patch) => api.patch("/api/settings", p), { invalidate: [["settings"], ["dashboard"], ["system"]] });
  const [name, setName] = useState("");
  const [log, setLog] = useState(false);
  useEffect(() => setName(data?.displayName ?? ""), [data?.displayName]);

  if (isLoading && !data) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  const s = data.settings;
  const n = (p: Partial<Settings["notifications"]>) => save.mutate({ settings: { notifications: p } });
  const a = (p: Partial<Settings["ai"]>) => save.mutate({ settings: { ai: p } });

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-4">
      <Card>
        <CardHeader title="פרופיל" />
        <CardBody className="space-y-4">
          <Field label="איך לקרוא לך?">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם" />
              <Button variant="subtle" onClick={() => save.mutate({ displayName: name.trim() })} disabled={name === data.displayName}>
                שמירה
              </Button>
            </div>
          </Field>
          <Field label="אזור זמן" hint="קובע מתי מתחיל יום חדש ומתי נשלחות תזכורות.">
            <Select value={data.timezone} onChange={(e) => save.mutate({ timezone: e.target.value })} className="ltr">
              {[...new Set([data.timezone, ...TIMEZONES])].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <NotificationsCard s={s} onChange={n} proactivity={s.proactivity} onProactivity={(p) => save.mutate({ settings: { proactivity: p } })} />

      <Card>
        <CardHeader title="AI ופרטיות" subtitle="ה־AI מקבל רק עובדות מחושבות שרלוונטיות לשאלה — אף פעם לא את כל המאגר." />
        <CardBody className="divide-y divide-line py-0">
          <Switch checked={s.ai.enabled} onCheckedChange={(v) => a({ enabled: v })} label="שימוש ב־AI" description="כבוי = תשובות, סיכומים וסקירות מחושבים בלי AI." />
          <Switch checked={s.ai.shareJournalText} onCheckedChange={(v) => a({ shareJournalText: v })} label="שיתוף קטעי יומן והערות" description="מאפשר ל־NOVA להבין הקשר. כבוי = רק מספרים ותגיות." />
          <Switch checked={s.ai.shareTransactions} onCheckedChange={(v) => a({ shareTransactions: v })} label="שיתוף עסקאות בודדות" description="כבוי = רק סכומים לפי קטגוריה." />
          <Switch checked={s.ai.proposeMemories} onCheckedChange={(v) => a({ proposeMemories: v })} label="הצעות לזיכרון" description="NOVA יכולה להציע דברים לזכור — תמיד רק באישורך." />
        </CardBody>
        <CardBody className="border-t border-line">
          <div className="text-sm">
            <div className="mb-2 font-medium">ספקי AI פעילים</div>
            {sys?.ai.providers.length ? (
              <ul className="space-y-2">
                {sys.ai.providers.map((p) => (
                  <li key={p.id} className="rounded-xl bg-sunken p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{p.label}</span>
                      <span className="ltr text-xs text-muted">
                        {p.fast} / {p.deep}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">{p.privacyNote}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">
                לא הוגדר ספק AI. הוסף <span className="ltr font-mono text-xs">GEMINI_API_KEY</span> (חינמי) במשתני הסביבה של השרת.
              </p>
            )}
            <button onClick={() => setLog(true)} className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-accent">
              <ShieldCheck className="size-4" /> מה נשלח ל־AI לאחרונה?
            </button>
          </div>
        </CardBody>
      </Card>

      <AppCard />
      <DataCard onErased={() => router.push("/")} />

      <Sheet open={log} onOpenChange={setLog} title="יומן שימוש ב־AI" description="לכל קריאה: איזה סוג מידע נכלל וכמה — בלי התוכן עצמו." size="lg" tall>
        <ul className="divide-y divide-line text-sm">
          {(sys?.aiLog ?? []).map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{TASK[t.type] ?? t.type}</span>
                <span className="num text-xs text-muted">{new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(t.at))}</span>
              </div>
              <div className="ltr mt-0.5 text-start text-xs text-muted">
                {t.provider ?? "—"} · {t.model ?? "—"} · {t.contextChars ?? 0} chars · {t.latencyMs ?? 0}ms {t.status !== "ok" ? `· ${t.error ?? t.status}` : ""}
              </div>
              <div className="mt-1 text-xs text-ink-2">
                {Object.entries(t.dataScope as Record<string, number>)
                  .filter(([, v]) => typeof v === "number" && v > 0)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ") || "—"}
              </div>
            </li>
          ))}
          {!sys?.aiLog.length ? <li className="py-8 text-center text-muted">עוד לא היו קריאות ל־AI.</li> : null}
        </ul>
      </Sheet>
    </div>
  );
}

const TASK: Record<string, string> = { ask: "שאלה", plan: "תכנון שאלה", daily_brief: "סיכום יומי", weekly_review: "סקירה שבועית", experiment_summary: "סיכום ניסוי" };

function NotificationsCard({ s, onChange, proactivity, onProactivity }: { s: Settings; onChange: (p: Partial<Settings["notifications"]>) => void; proactivity: Settings["proactivity"]; onProactivity: (p: Settings["proactivity"]) => void }) {
  const push = usePush();
  const nt = s.notifications;
  return (
    <Card>
      <CardHeader title="התראות ותזכורות" subtitle="תזכורות נשלחות רק כשהן רלוונטיות — לא לפי שעון קבוע." />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
          <div className="text-sm">
            <div className="font-medium">התראות במכשיר הזה</div>
            <div className="text-[13px] text-muted">
              {push.state === "subscribed" ? "פעילות" : push.state === "denied" ? "חסומות בהגדרות הדפדפן" : push.state === "ios-needs-install" ? "באייפון: הוסף את NOVA למסך הבית כדי לקבל התראות" : push.state === "unsupported" ? "לא נתמך בדפדפן הזה" : push.state === "not-configured" ? "השרת עוד לא הוגדר להתראות" : "כבויות"}
            </div>
          </div>
          {push.state === "subscribed" ? (
            <div className="flex gap-2">
              <Button size="sm" variant="subtle" onClick={() => api.post("/api/push/test").catch(() => {})}>
                בדיקה
              </Button>
              <Button size="sm" variant="ghost" onClick={push.unsubscribe} loading={push.busy}>
                כיבוי
              </Button>
            </div>
          ) : push.state === "prompt" || push.state === "not-configured" ? (
            <Button size="sm" onClick={push.subscribe} loading={push.busy}>
              הפעלה
            </Button>
          ) : null}
        </div>
        <Field label="כמה יוזמה מ־NOVA?">
          <Segmented
            value={proactivity}
            onChange={onProactivity}
            className="w-full"
            options={[
              { value: "quiet", label: "שקט" },
              { value: "balanced", label: "מאוזן" },
              { value: "active", label: "פעיל" },
            ]}
          />
        </Field>
      </CardBody>
      <CardBody className="divide-y divide-line py-0">
        <Switch checked={nt.enabled} onCheckedChange={(v) => onChange({ enabled: v })} label="התראות פעילות" />
        <Switch checked={nt.habitReminders} onCheckedChange={(v) => onChange({ habitReminders: v })} label="תזכורות חכמות להרגלים" description="רק להרגלים שהפעלת להם תזכורת, ורק אם עוד לא בוצעו." />
        <Switch checked={nt.checkinReminder != null} onCheckedChange={(v) => onChange({ checkinReminder: v ? "21:30" : null })} label="תזכורת לצ׳ק־אין בערב" />
        <Switch checked={nt.dailyBrief} onCheckedChange={(v) => onChange({ dailyBrief: v })} label="סיכום יומי בבוקר" />
        <Switch checked={nt.weeklyReview} onCheckedChange={(v) => onChange({ weeklyReview: v })} label="סקירה שבועית ביום ראשון" />
        <Switch checked={nt.insights} onCheckedChange={(v) => onChange({ insights: v })} label="דפוסים חדשים" description="לכל היותר אחת ביום, רק בביטחון בינוני ומעלה." />
      </CardBody>
      <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {nt.checkinReminder != null ? (
          <Field label="שעת צ׳ק־אין">
            <Input type="time" value={nt.checkinReminder} onChange={(e) => e.target.value && onChange({ checkinReminder: e.target.value })} className="ltr num" />
          </Field>
        ) : null}
        <Field label="שקט מ־">
          <Input type="time" value={nt.quietStart} onChange={(e) => e.target.value && onChange({ quietStart: e.target.value })} className="ltr num" />
        </Field>
        <Field label="עד">
          <Input type="time" value={nt.quietEnd} onChange={(e) => e.target.value && onChange({ quietEnd: e.target.value })} className="ltr num" />
        </Field>
        <Field label="מקסימום ביום">
          <Select value={String(nt.maxPerDay)} onChange={(e) => onChange({ maxPerDay: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 8].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </Field>
      </CardBody>
    </Card>
  );
}

function AppCard() {
  const standalone = useStandalone();
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)), []);
  const lock = async () => {
    await api.post("/api/auth/lock");
    await clearPersistedCache();
    location.href = "/unlock";
  };
  return (
    <Card>
      <CardHeader title="האפליקציה" />
      <CardBody className="space-y-3 text-[14px]">
        <div className="flex items-center justify-between gap-2">
          <span>מצב התקנה</span>
          <Badge tone={standalone ? "positive" : "neutral"}>{standalone ? "מותקנת" : "בדפדפן"}</Badge>
        </div>
        {!standalone ? (
          <p className="leading-relaxed text-muted">
            {ios ? "בספארי: כפתור השיתוף ← „הוספה למסך הבית”. כך NOVA נפתחת כמו אפליקציה ויכולה לשלוח התראות." : "בכרום/אדג׳: סמל ההתקנה בשורת הכתובת, או תפריט ← „התקנת NOVA”."}
          </p>
        ) : null}
        <Button variant="subtle" size="sm" onClick={lock}>
          <LogOut className="size-4" /> נעילה ויציאה
        </Button>
      </CardBody>
    </Card>
  );
}

function DataCard({ onErased }: { onErased: () => void }) {
  const { data: demo } = useDemo();
  const load = useAction(() => api.post("/api/demo"), { success: "נתוני הדוגמה נטענו" });
  const remove = useAction(() => api.del("/api/demo"), { success: "נתוני הדוגמה נמחקו" });
  const [confirmText, setConfirmText] = useState("");
  const [eraseOpen, setEraseOpen] = useState(false);
  const erase = useAction(() => api.post("/api/data/erase", { confirm: confirmText }), {
    success: "כל הנתונים נמחקו",
    onSuccess: async () => {
      await clearPersistedCache();
      setEraseOpen(false);
      onErased();
    },
  });
  return (
    <Card>
      <CardHeader title="נתונים" />
      <CardBody className="space-y-3">
        <a href="/api/export" download className="flex items-center justify-between gap-2 rounded-xl bg-sunken p-3.5 text-[14px] hover:bg-line">
          <span>ייצוא כל הנתונים (JSON)</span>
          <Download className="size-4 text-muted" />
        </a>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-sunken p-3.5 text-[14px]">
          <span>נתוני דוגמה (100 ימים)</span>
          {demo?.active ? (
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(undefined)} loading={remove.isPending}>
              הסרה
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => load.mutate(undefined)} loading={load.isPending}>
              טעינה
            </Button>
          )}
        </div>
        <Button variant="danger" size="sm" onClick={() => setEraseOpen(true)}>
          מחיקת כל הנתונים
        </Button>
      </CardBody>
      <Sheet open={eraseOpen} onOpenChange={setEraseOpen} title="מחיקת כל הנתונים" description="פעולה בלתי הפיכה. מומלץ לייצא קודם." size="sm" footer={<Button variant="danger" block onClick={() => erase.mutate(undefined)} loading={erase.isPending} disabled={confirmText.trim() !== "מחק הכול"}>מחיקה לצמיתות</Button>}>
        <Field label="כדי לאשר, הקלד: מחק הכול">
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </Field>
      </Sheet>
    </Card>
  );
}
