"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { api } from "@/client/api";
import { useAction } from "@/client/mutations";
import { useGoal, useHabits } from "@/client/queries";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { Chip, Field, Input, Segmented, Textarea } from "../ui/field";

export function GoalFormSheet({ open, onOpenChange, goalId }: { open: boolean; onOpenChange: (o: boolean) => void; goalId?: string }) {
  const router = useRouter();
  const { data: view } = useGoal(goalId ?? "");
  const g = goalId ? view?.goal : undefined;
  const { data: habits } = useHabits();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"manual" | "milestones" | "habits">("manual");
  const [target, setTarget] = useState("");
  const [start, setStart] = useState("");
  const [unit, setUnit] = useState("");
  const [deadline, setDeadline] = useState("");
  const [habitIds, setHabitIds] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<string[]>([""]);

  useEffect(() => {
    if (!open) return;
    setTitle(g?.title ?? "");
    setDescription(g?.description ?? "");
    setMode(g?.progressMode ?? "manual");
    setTarget(g?.targetValue != null ? String(g.targetValue) : "");
    setStart(g?.startValue != null ? String(g.startValue) : "");
    setUnit(g?.unit ?? "");
    setDeadline(g?.deadline ?? "");
    setHabitIds(view?.habitIds ?? []);
    setMilestones([""]);
  }, [open, g, view]);

  const save = useAction(
    async () => {
      const common = {
        title: title.trim(),
        description: description.trim() || null,
        progressMode: mode,
        targetValue: target ? Number(target) : null,
        startValue: start ? Number(start) : null,
        unit: unit.trim() || null,
        deadline: deadline || null,
        habitIds,
      };
      if (goalId) return api.patch(`/api/goals/${goalId}`, common);
      return api.post<{ id: string }>("/api/goals", { ...common, milestones: milestones.map((m) => m.trim()).filter(Boolean).map((t) => ({ title: t })) });
    },
    {
      success: goalId ? "המטרה עודכנה" : "המטרה נוספה",
      onSuccess: (r) => {
        onOpenChange(false);
        const id = (r as { data?: { id?: string } | null }).data?.id;
        if (!goalId && id) router.push(`/goals/${id}`);
      },
    },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={goalId ? "עריכת מטרה" : "מטרה חדשה"} tall footer={<Button block size="lg" onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!title.trim()}>{goalId ? "שמירה" : "הוספה"}</Button>}>
      <div className="space-y-5 pt-1">
        <Field label="מה המטרה?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: ללמוד React" />
        </Field>
        <Field label="איך מודדים התקדמות?">
          <Segmented
            value={mode}
            onChange={setMode}
            className="w-full"
            options={[
              { value: "manual", label: "מספר" },
              { value: "milestones", label: "אבני דרך" },
              { value: "habits", label: "עקביות הרגלים" },
            ]}
          />
        </Field>
        {mode === "manual" ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="התחלה">
              <Input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} className="num" />
            </Field>
            <Field label="יעד">
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="num" />
            </Field>
            <Field label="יחידה">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ק״ג" />
            </Field>
          </div>
        ) : null}
        {mode === "milestones" && !goalId ? (
          <Field label="אבני דרך">
            <div className="space-y-2">
              {milestones.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={m} onChange={(e) => setMilestones((x) => x.map((y, j) => (j === i ? e.target.value : y)))} placeholder={`אבן דרך ${i + 1}`} />
                  {milestones.length > 1 ? (
                    <Button variant="ghost" size="icon" onClick={() => setMilestones((x) => x.filter((_, j) => j !== i))} aria-label="הסרה">
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
              <button className="text-sm font-medium text-accent" onClick={() => setMilestones((x) => [...x, ""])}>
                + אבן דרך
              </button>
            </div>
          </Field>
        ) : null}
        <Field label="דדליין (לא חובה)">
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="ltr num" />
        </Field>
        {habits?.length ? (
          <Field label="הרגלים שתורמים למטרה" hint="כך אפשר לראות אם ההתנהגות תומכת בהתקדמות.">
            <div className="flex flex-wrap gap-2">
              {habits.map((h) => (
                <Chip key={h.habit.id} active={habitIds.includes(h.habit.id)} onClick={() => setHabitIds((x) => (x.includes(h.habit.id) ? x.filter((y) => y !== h.habit.id) : [...x, h.habit.id]))}>
                  {h.habit.name}
                </Chip>
              ))}
            </div>
          </Field>
        ) : null}
        <Field label="למה זה חשוב לי? (לא חובה)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
