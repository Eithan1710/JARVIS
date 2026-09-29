"use client";
import { useState } from "react";
import { BookOpenText, Plus, Search, Star, Trash2 } from "lucide-react";
import { useJournal } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { openSheet } from "@/client/store";
import { useToday } from "@/client/today";
import { api } from "@/client/api";
import { formatDate, formatRelativeDay } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { PageIntro } from "@/components/features/insight";

export default function JournalPage() {
  const today = useToday();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, isLoading, error, refetch } = useJournal(query);
  const remove = useAction((id: string) => api.del(`/api/journal/${id}`), { success: "נמחק", invalidate: [["journal"], ["timeline"]] });
  const toggleImportant = useAction((v: { id: string; important: boolean }) => api.patch(`/api/journal/${v.id}`, { important: v.important }), { invalidate: [["journal"], ["timeline"]] });

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <PageIntro
        description="מחשבות, אירועים ומה שקרה — במילים שלך. הטקסט עוזר ל־NOVA להבין הקשר, ואפשר לכבות את השיתוף שלו עם ה־AI בהגדרות."
        actions={
          <Button onClick={() => openSheet({ kind: "journal" })}>
            <Plus className="size-4" /> רשומה
          </Button>
        }
      />
      <form
        className="relative mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש ביומן…" className="ps-10" enterKeyHint="search" type="search" />
      </form>
      {isLoading && !data ? (
        <Skeleton className="h-64 w-full rounded-[18px]" />
      ) : error && !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<BookOpenText className="size-6" />} title={query ? "לא נמצאו רשומות" : "היומן ריק"} body={query ? "נסה מילה אחרת." : "כמה משפטים בסוף היום מספיקים. עם הזמן זה הופך להיסטוריה אישית שאפשר לחפש בה."} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.map((j) => (
            <li key={j.id}>
              <Card as="article" className="p-4 md:p-5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[13px] text-muted">{formatRelativeDay(j.date, today) === formatDate(j.date) ? formatDate(j.date, { year: j.date.slice(0, 4) !== today.slice(0, 4) }) : formatRelativeDay(j.date, today)}</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => toggleImportant.mutate({ id: j.id, important: !j.important })} className="grid size-8 place-items-center rounded-lg hover:bg-sunken" aria-label={j.important ? "הסר סימון חשוב" : "סמן כחשוב"}>
                      <Star className={j.important ? "size-4 fill-warning text-warning" : "size-4 text-faint"} />
                    </button>
                    <button onClick={() => confirm("למחוק את הרשומה?") && remove.mutate(j.id)} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-sunken hover:text-negative" aria-label="מחיקה">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {j.title ? <h2 className="mb-1 text-[16px] font-semibold">{j.title}</h2> : null}
                <p className="selectable whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{j.body}</p>
                {j.tags.length ? <div className="mt-2 text-xs text-muted">{j.tags.map((t) => `#${t}`).join(" ")}</div> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
