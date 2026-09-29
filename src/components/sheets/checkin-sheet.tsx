"use client";
import { useEffect, useState } from "react";
import { addDays } from "@/lib/dates";
import { useCheckin } from "@/client/queries";
import { useSaveCheckin } from "@/client/mutations";
import { useToday } from "@/client/today";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { Chip, Field, ScorePicker, Segmented, Textarea, Input } from "../ui/field";

const TAGS = ["עבודה", "אימון", "חברים", "משפחה", "עייפות", "לחץ", "טבע", "למידה", "חופש", "מחלה"];

export function CheckinSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = useToday();
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const date = day === "today" ? today : addDays(today, -1);
  const { data: existing } = useCheckin(date);
  const save = useSaveCheckin();
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [highlight, setHighlight] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMood(existing?.mood ?? null);
    setEnergy(existing?.energy ?? null);
    setFocus(existing?.focus ?? null);
    setNote(existing?.note ?? "");
    setHighlight(existing?.highlight ?? "");
    setTags(existing?.tags ?? []);
    setMore(Boolean(existing?.note || existing?.highlight));
  }, [open, existing]);

  const submit = async () => {
    await save.mutateAsync({ date, mood, energy, focus, note: note.trim() || null, highlight: highlight.trim() || null, tags });
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="איך היה?"
      description="כמה שניות. אפשר למלא רק חלק."
      footer={
        <Button block size="lg" onClick={submit} loading={save.isPending} disabled={mood == null && energy == null && focus == null && !note.trim() && !highlight.trim()}>
          שמירה
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        <Segmented
          value={day}
          onChange={setDay}
          options={[
            { value: "today", label: "היום" },
            { value: "yesterday", label: "אתמול" },
          ]}
          className="w-full"
        />
        <ScorePicker label="מצב רוח" value={mood} onChange={setMood} lowLabel="קשה" highLabel="מעולה" />
        <ScorePicker label="אנרגיה" value={energy} onChange={setEnergy} lowLabel="מרוקן" highLabel="מלא כוח" />
        <ScorePicker label="ריכוז" value={focus} onChange={setFocus} lowLabel="מפוזר" highLabel="חד" />
        <div>
          <div className="mb-2 text-[15px] font-medium">תגיות</div>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <Chip key={t} active={tags.includes(t)} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
        {more ? (
          <>
            <Field label="מה קרה היום?">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="כמה מילים חופשיות…" rows={3} />
            </Field>
            <Field label="אירוע חשוב" hint="משהו שכדאי לזכור בעוד חודשים.">
              <Input value={highlight} onChange={(e) => setHighlight(e.target.value)} placeholder="למשל: התחלתי קורס חדש" />
            </Field>
          </>
        ) : (
          <button className="text-sm font-medium text-accent" onClick={() => setMore(true)}>
            + הוספת טקסט חופשי או אירוע חשוב
          </button>
        )}
      </div>
    </Sheet>
  );
}
