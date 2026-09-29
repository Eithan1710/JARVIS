"use client";
import { useState } from "react";
import { useAddJournal } from "@/client/mutations";
import { useToday } from "@/client/today";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { Field, Input, Switch, Textarea } from "../ui/field";

export function JournalSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = useToday();
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [important, setImportant] = useState(false);
  const add = useAddJournal();
  const submit = async () => {
    if (!body.trim()) return;
    await add.mutateAsync({ date: today, body: body.trim(), title: title.trim() || null, important });
    setBody("");
    setTitle("");
    setImportant(false);
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="רשומת יומן" tall footer={<Button block size="lg" onClick={submit} loading={add.isPending} disabled={!body.trim()}>שמירה</Button>}>
      <div className="space-y-4 pt-1">
        <Field label="כותרת (לא חובה)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="מה קרה, מה הרגשת, מה למדת…" className="min-h-[40dvh] text-[16px]" />
        <Switch checked={important} onCheckedChange={setImportant} label="אירוע חשוב" description="יסומן בציר הזמן ויישקל בניתוחים ארוכי טווח." />
      </div>
    </Sheet>
  );
}
