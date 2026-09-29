"use client";
import { useRef, useState } from "react";
import { CalendarDays, Check, CloudSun, Copy, FileSpreadsheet, Github, HeartPulse, Music, NotebookPen, RefreshCw, Trash2, Upload } from "lucide-react";
import { useIntegrations, type IntegrationsResponse } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { api, errorMessage } from "@/client/api";
import { toast } from "@/client/store";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/field";
import { Badge, ErrorState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { PageIntro } from "@/components/features/insight";

type Def = IntegrationsResponse["catalog"][number];
type Conn = IntegrationsResponse["connected"][number];

const ICONS: Record<string, typeof HeartPulse> = { health: HeartPulse, calendar: CalendarDays, files: FileSpreadsheet, environment: CloudSun, work: Github, music: Music, notes: NotebookPen, finance: FileSpreadsheet };

export default function IntegrationsPage() {
  const { data, isLoading, error, refetch } = useIntegrations();
  const [open, setOpen] = useState<Def | null>(null);
  if (isLoading && !data) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  return (
    <div className="animate-fade-in">
      <PageIntro description="כל מקור מתורגם למודל הנתונים של NOVA, עם תיעוד מלא: מאיפה הגיע, מתי יובא ומה היה הערך המקורי. סודות (קישורים פרטיים, טוקנים) נשמרים מוצפנים." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.catalog.map((d) => {
          const conns = data.connected.filter((c) => c.provider === d.id);
          const Icon = ICONS[d.category] ?? FileSpreadsheet;
          return (
            <button key={d.id} disabled={d.status !== "available"} onClick={() => setOpen(d)} className={cn("card flex flex-col p-4 text-start transition-shadow md:p-5", d.status === "available" ? "hover:shadow-float" : "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="size-5" />
                </span>
                {conns.length ? (
                  <Badge tone={conns.some((c) => c.status === "error") ? "negative" : "positive"}>{conns.some((c) => c.status === "error") ? "שגיאה" : "מחובר"}</Badge>
                ) : d.status === "coming_soon" ? (
                  <Badge>בקרוב</Badge>
                ) : null}
              </div>
              <h2 className="mt-3 text-[16px] font-semibold">{d.name}</h2>
              <p className="mt-1 flex-1 text-[14px] leading-relaxed text-muted">{d.description}</p>
              <p className="mt-3 text-xs text-faint">{d.dataTypes.join(" · ")}</p>
            </button>
          );
        })}
      </div>
      <IntegrationSheet def={open} connections={open ? data.connected.filter((c) => c.provider === open.id) : []} onClose={() => setOpen(null)} />
    </div>
  );
}

function IntegrationSheet({ def, connections, onClose }: { def: Def | null; connections: Conn[]; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [token, setToken] = useState<string | null>(null);
  const connect = useAction(() => api.post<{ id: string; ingestToken: string | null }>("/api/integrations", { provider: def!.id, values }), {
    success: "החיבור נוצר",
    invalidate: "all",
    onSuccess: (r) => {
      const t = (r as { data?: { ingestToken?: string | null } | null }).data?.ingestToken;
      if (t) setToken(t);
      setValues({});
    },
  });
  const sync = useAction((id: string) => api.post(`/api/integrations/${id}/sync`), { success: "סונכרן", invalidate: "all" });
  const regen = useAction((id: string) => api.post<{ token: string }>(`/api/integrations/${id}/token`), { onSuccess: (r) => setToken((r as { data?: { token: string } | null }).data?.token ?? null) });
  const disconnect = useAction((v: { id: string; purge: boolean }) => api.del(`/api/integrations/${v.id}${v.purge ? "?purge=1" : ""}`), { success: "החיבור הוסר", invalidate: "all" });

  const close = () => {
    setToken(null);
    setValues({});
    onClose();
  };
  if (!def) return null;
  const ingestUrl = token ? `${location.origin}/api/ingest/${token}` : null;
  const canAddAnother = def.auth === "secret_url" || connections.length === 0;

  return (
    <Sheet open onOpenChange={(o) => !o && close()} title={def.name} description={def.description} size="lg" tall>
      <div className="space-y-5 pb-2">
        {def.auth === "file" ? (
          <CsvImport />
        ) : (
          <>
            {connections.map((c) => (
              <div key={c.id} className="rounded-2xl p-4 ring-1 ring-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">{String((c.config as Record<string, unknown>).label ?? (c.config as Record<string, unknown>).name ?? (c.config as Record<string, unknown>).username ?? "חיבור")}</div>
                    <div className="text-[13px] text-muted">
                      {c.lastSyncAt ? `עודכן ${new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(c.lastSyncAt))}` : "עוד לא התקבלו נתונים"} · {c.records} רשומות
                    </div>
                    {c.lastError ? <div className="mt-1 text-[13px] text-negative">שגיאה אחרונה: {c.lastError}</div> : null}
                  </div>
                  <div className="flex gap-1">
                    {def.pull ? (
                      <Button size="sm" variant="subtle" onClick={() => sync.mutate(c.id)} loading={sync.isPending}>
                        <RefreshCw className="size-4" /> סנכרון
                      </Button>
                    ) : null}
                    {def.auth === "webhook" ? (
                      <Button size="sm" variant="subtle" onClick={() => confirm("ליצור קישור חדש? הקישור הקודם יפסיק לעבוד.") && regen.mutate(c.id)}>
                        קישור חדש
                      </Button>
                    ) : null}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="ניתוק"
                      onClick={() => {
                        if (!confirm("לנתק את החיבור?")) return;
                        disconnect.mutate({ id: c.id, purge: confirm("למחוק גם את כל הנתונים שהגיעו מהחיבור הזה? (ביטול = הנתונים נשארים)") });
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {ingestUrl ? (
              <div className="rounded-2xl bg-accent-soft p-4">
                <div className="mb-1 text-sm font-semibold text-accent-strong">הקישור הפרטי שלך (מוצג פעם אחת)</div>
                <div className="flex items-center gap-2">
                  <code className="ltr min-w-0 flex-1 truncate rounded-lg bg-surface px-2.5 py-2 font-mono text-xs">{ingestUrl}</code>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(ingestUrl);
                      toast("הועתק", { tone: "success" });
                    }}
                  >
                    <Copy className="size-4" /> העתקה
                  </Button>
                </div>
                <p className="mt-2 text-[13px] text-ink-2">כל מי שיש לו את הקישור יכול לשלוח נתונים לחשבון שלך — אל תשתף אותו.</p>
              </div>
            ) : null}

            {canAddAnother ? (
              <div className="space-y-4">
                {def.fields.map((f) => (
                  <Field key={f.key} label={f.label} hint={f.help}>
                    <Input
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      type={f.type === "secret" ? "password" : "text"}
                      inputMode={f.type === "number" ? "decimal" : undefined}
                      className={f.dir === "ltr" ? "ltr" : undefined}
                      autoComplete="off"
                    />
                  </Field>
                ))}
                {def.auth === "location" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigator.geolocation?.getCurrentPosition(
                        (p) => setValues((v) => ({ ...v, latitude: p.coords.latitude.toFixed(3), longitude: p.coords.longitude.toFixed(3), name: v.name || "המיקום שלי" })),
                        () => toast("לא התקבלה הרשאת מיקום", { tone: "error" }),
                      )
                    }
                  >
                    המיקום שלי
                  </Button>
                ) : null}
                <Button onClick={() => connect.mutate(undefined)} loading={connect.isPending} block>
                  {def.auth === "webhook" ? "יצירת קישור פרטי" : "חיבור"}
                </Button>
              </div>
            ) : null}
          </>
        )}

        {def.setupSteps.length ? (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-muted">איך מחברים</h3>
            <ol className="list-decimal space-y-1.5 ps-5 text-[14px] leading-relaxed text-ink-2">
              {def.setupSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {def.id === "health_webhook" ? (
          <details className="rounded-xl bg-sunken p-3 text-[13px]">
            <summary className="cursor-pointer font-medium">דוגמה לגוף הבקשה</summary>
            <pre className="ltr mt-2 overflow-x-auto text-start font-mono text-xs">{`{
  "records": [
    { "type": "sleep_hours", "value": 7.4, "date": "2026-09-29" },
    { "type": "bedtime", "value": "23:40", "date": "2026-09-29" },
    { "type": "steps", "value": 8421, "date": "2026-09-28" },
    { "type": "workout_minutes", "value": 62, "date": "2026-09-28", "name": "כוח" }
  ]
}`}</pre>
          </details>
        ) : null}
      </div>
    </Sheet>
  );
}

function CsvImport() {
  const [kind, setKind] = useState<"metrics" | "transactions">("transactions");
  const [csv, setCsv] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<{ total: number; errors: string[]; preview: Record<string, unknown>[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const run = async (dryRun: boolean) => {
    if (!csv) return;
    setBusy(true);
    try {
      const r = await api.post<{ total?: number; errors: string[]; preview?: Record<string, unknown>[]; records?: number }>("/api/import/csv", { kind, csv, dryRun });
      if (dryRun) setPreview({ total: r.data?.total ?? 0, errors: r.data?.errors ?? [], preview: r.data?.preview ?? [] });
      else {
        toast(`יובאו ${r.data?.records ?? 0} רשומות`, { tone: "success" });
        setCsv(null);
        setPreview(null);
        setName("");
      }
    } catch (e) {
      toast(errorMessage(e), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k);
          setPreview(null);
        }}
        className="w-full"
        options={[
          { value: "transactions", label: "הוצאות" },
          { value: "metrics", label: "מדדים" },
        ]}
      />
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 3_000_000) return toast("הקובץ גדול מדי (עד 3MB)", { tone: "error" });
          setName(f.name);
          setCsv(await f.text());
          setPreview(null);
        }}
      />
      <button onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-4 py-8 text-sm text-muted hover:bg-surface-2">
        <Upload className="size-6" />
        {name ? <span className="ltr font-medium text-ink">{name}</span> : "בחירת קובץ CSV"}
      </button>
      {csv && !preview ? (
        <Button block onClick={() => run(true)} loading={busy}>
          תצוגה מקדימה
        </Button>
      ) : null}
      {preview ? (
        <div className="space-y-3">
          <p className="text-sm">
            נמצאו <b className="num">{preview.total}</b> שורות תקינות.
            {preview.errors.length ? <span className="text-warning"> {preview.errors.length} שורות ידולגו.</span> : null}
          </p>
          <ul className="divide-y divide-line rounded-xl text-sm ring-1 ring-line">
            {preview.preview.map((p, i) => (
              <li key={i} className="num flex justify-between gap-2 px-3 py-2">
                <span>{formatDate(String(p.date), { short: true })}</span>
                <span className="truncate text-muted">{String(p.merchant ?? p.description ?? p.metricKey ?? p.category ?? "")}</span>
                <span className="font-medium">{String(p.amount ?? p.value)}</span>
              </li>
            ))}
          </ul>
          <Button block onClick={() => run(false)} loading={busy}>
            <Check className="size-4" /> ייבוא
          </Button>
        </div>
      ) : null}
    </div>
  );
}
