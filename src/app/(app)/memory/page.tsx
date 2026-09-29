"use client";
import { useState } from "react";
import { Archive, Check, Library, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemories, type MemoryJ } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { api } from "@/client/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip, Field, Input } from "@/components/ui/field";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { PageIntro } from "@/components/features/insight";

type Kind = MemoryJ["kind"];
const KINDS: { value: Kind; label: string; example: string }[] = [
  { value: "fact", label: "עובדה", example: "אני עובד במשמרות בוקר" },
  { value: "preference", label: "העדפה", example: "אני לא אוהב להתאמן מאוחר בלילה" },
  { value: "goal", label: "מטרה", example: "המטרה שלי השנה היא לרוץ 10 ק״מ" },
  { value: "event", label: "אירוע חשוב", example: "התחלתי עבודה חדשה בספטמבר 2026" },
  { value: "pattern", label: "דפוס", example: "בשבועות עמוסים אני מתאמן פחות" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<Kind, string>;
const SOURCE: Record<string, string> = { user: "נכתב על ידך", ai_conversation: "הוצע בשיחה עם NOVA", insight: "הוצע מתובנה", system: "מערכת", import: "ייבוא" };

export default function MemoryPage() {
  const { data, isLoading, error, refetch } = useMemories();
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [edit, setEdit] = useState<MemoryJ | "new" | null>(null);
  const set = useAction((v: { id: string; status: string }) => api.patch(`/api/memories/${v.id}`, { status: v.status }), { invalidate: [["memories"]] });
  const del = useAction((id: string) => api.del(`/api/memories/${id}`), { success: "נמחק", invalidate: [["memories"]] });

  if (isLoading && !data) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  const proposed = data.filter((m) => m.status === "proposed");
  const active = data.filter((m) => m.status === "active" && (filter === "all" || m.kind === filter));
  const archived = data.filter((m) => m.status === "archived");

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <PageIntro
        description="מה ש־NOVA זוכרת עליך לטווח ארוך. זה לא נתונים גולמיים — אלה דברים שחשוב להבין אותם בכל שיחה. שום דבר לא נכנס לכאן בלי אישור שלך."
        actions={
          <Button onClick={() => setEdit("new")}>
            <Plus className="size-4" /> הוספה
          </Button>
        }
      />

      {proposed.length ? (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">ממתין לאישור</h2>
          <Card className="divide-y divide-line">
            {proposed.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{m.content}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {KIND_LABEL[m.kind]} · {SOURCE[m.source] ?? m.source}
                    {m.confidence ? ` · ביטחון ${m.confidence === "high" ? "גבוה" : m.confidence === "medium" ? "בינוני" : "נמוך"}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => set.mutate({ id: m.id, status: "active" })}>
                    <Check className="size-4" /> אישור
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => set.mutate({ id: m.id, status: "rejected" })}>
                    <X className="size-4" /> דחייה
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          הכול
        </Chip>
        {KINDS.map((k) => (
          <Chip key={k.value} active={filter === k.value} onClick={() => setFilter(k.value)}>
            {k.label}
          </Chip>
        ))}
      </div>

      {active.length ? (
        <Card className="divide-y divide-line">
          {active.map((m) => (
            <div key={m.id} className="group flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="selectable text-[15px] leading-relaxed">{m.content}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge>{KIND_LABEL[m.kind]}</Badge>
                  <span>{SOURCE[m.source] ?? m.source}</span>
                  <span>· {formatDate(m.updatedAt.slice(0, 10), { short: true })}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5 md:opacity-0 md:group-hover:opacity-100">
                <button onClick={() => setEdit(m)} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-sunken hover:text-ink" aria-label="עריכה">
                  <Pencil className="size-4" />
                </button>
                <button onClick={() => set.mutate({ id: m.id, status: "archived" })} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-sunken hover:text-ink" aria-label="ארכיון" title="לא רלוונטי יותר">
                  <Archive className="size-4" />
                </button>
                <button onClick={() => confirm("למחוק?") && del.mutate(m.id)} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-sunken hover:text-negative" aria-label="מחיקה">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<Library className="size-6" />} title="הזיכרון ריק" body="הוסף דברים שחשוב ש־NOVA תדע — העדפות, הקשר מהחיים, אירועים משמעותיים. גם בשיחות, NOVA עשויה להציע דברים לשמור." />
        </Card>
      )}

      {archived.length ? (
        <details className="mt-6">
          <summary className="cursor-pointer px-1 text-[13px] font-semibold text-muted">ארכיון ({archived.length})</summary>
          <Card className="mt-2 divide-y divide-line">
            {archived.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-4 text-muted">
                <p className="min-w-0 flex-1 text-[14px]">{m.content}</p>
                <button onClick={() => set.mutate({ id: m.id, status: "active" })} className="text-xs font-medium text-accent">
                  שחזור
                </button>
              </div>
            ))}
          </Card>
        </details>
      ) : null}

      <MemoryEditor value={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function MemoryEditor({ value, onClose }: { value: MemoryJ | "new" | null; onClose: () => void }) {
  const existing = value && value !== "new" ? value : null;
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "fact");
  const [content, setContent] = useState(existing?.content ?? "");
  const [key, setKey] = useState<string | null>(null);
  const k = value === "new" ? "new" : existing?.id ?? null;
  if (k !== key) {
    setKey(k);
    setKind(existing?.kind ?? "fact");
    setContent(existing?.content ?? "");
  }
  const save = useAction(() => (existing ? api.patch(`/api/memories/${existing.id}`, { kind, content }) : api.post("/api/memories", { kind, content })), { success: "נשמר", invalidate: [["memories"]], onSuccess: onClose });
  const example = KINDS.find((x) => x.value === kind)?.example;
  return (
    <Sheet open={Boolean(value)} onOpenChange={(o) => !o && onClose()} title={existing ? "עריכת זיכרון" : "זיכרון חדש"} size="md" footer={<Button block size="lg" onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={content.trim().length < 2}>שמירה</Button>}>
      <div className="space-y-4 pt-1">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          {KINDS.map((x) => (
            <Chip key={x.value} active={kind === x.value} onClick={() => setKind(x.value)}>
              {x.label}
            </Chip>
          ))}
        </div>
        <Field label="מה לזכור?" hint={example ? `למשל: ${example}` : undefined}>
          <Input value={content} onChange={(e) => setContent(e.target.value)} autoFocus className={cn("text-[16px]")} />
        </Field>
      </div>
    </Sheet>
  );
}

