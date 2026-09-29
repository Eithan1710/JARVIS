"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/client/api";
import { useAction } from "@/client/mutations";
import { useHabit } from "@/client/queries";
import { METRIC_MAP } from "@/lib/metrics";
import { WEEKDAY_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { Field, Input, Segmented, Select, Switch } from "../ui/field";

type Freq = "daily" | "specific_days" | "weekly_count";
const LINKABLE = ["workout_minutes", "steps", "sleep_hours", "protein_g", "study_minutes", "reading_minutes", "meditation_minutes", "deep_work_hours"];

export function HabitFormSheet({ open, onOpenChange, habitId }: { open: boolean; onOpenChange: (o: boolean) => void; habitId?: string }) {
  const router = useRouter();
  const { data } = useHabit(habitId ?? "");
  const h = habitId ? data?.habit : undefined;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState<"main" | "side">("main");
  const [frequency, setFrequency] = useState<Freq>("daily");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [weeklyTarget, setWeeklyTarget] = useState(3);
  const [kind, setKind] = useState<"boolean" | "quantity">("boolean");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [timeLabel, setTimeLabel] = useState("");
  const [reminder, setReminder] = useState(false);
  const [metricKey, setMetricKey] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(h?.name ?? "");
    setDescription(h?.description ?? "");
    setTier(h?.tier ?? "main");
    setFrequency(h?.frequency ?? "daily");
    setDays(h?.scheduleDays ?? [0, 1, 2, 3, 4]);
    setWeeklyTarget(h?.weeklyTarget ?? 3);
    setKind(h?.kind ?? "boolean");
    setTarget(h?.targetValue != null ? String(h.targetValue) : "");
    setUnit(h?.unit ?? "");
    setPreferredTime(h?.preferredTime ?? "");
    setTimeLabel(h?.timeLabel ?? "");
    setReminder(h?.reminderEnabled ?? false);
    setMetricKey(h?.metricKey ?? "");
  }, [open, h]);

  const save = useAction(
    async () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        tier,
        frequency,
        scheduleDays: frequency === "specific_days" ? days : [0, 1, 2, 3, 4, 5, 6],
        weeklyTarget: frequency === "weekly_count" ? weeklyTarget : null,
        kind,
        targetValue: kind === "quantity" && Number(target) > 0 ? Number(target) : null,
        unit: kind === "quantity" ? unit.trim() || null : null,
        preferredTime: preferredTime || null,
        timeLabel: timeLabel.trim() || null,
        reminderEnabled: reminder,
        metricKey: metricKey || null,
      };
      return habitId ? api.patch(`/api/habits/${habitId}`, body) : api.post<{ id: string }>("/api/habits", body);
    },
    {
      success: habitId ? "ההרגל עודכן" : "ההרגל נוסף",
      onSuccess: (r) => {
        onOpenChange(false);
        const id = (r as { data?: { id?: string } | null }).data?.id;
        if (!habitId && id) router.push(`/habits/${id}`);
      },
    },
  );

  const valid = name.trim().length > 0 && (frequency !== "specific_days" || days.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={habitId ? "עריכת הרגל" : "הרגל חדש"} tall footer={<Button block size="lg" onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>{habitId ? "שמירה" : "הוספה"}</Button>}>
      <div className="space-y-5 pt-1">
        <Field label="שם">
          <Input autoFocus={!habitId} value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: חדר כושר, קריאה 20 דקות" />
        </Field>
        <Field label="סוג">
          <Segmented
            value={tier}
            onChange={setTier}
            className="w-full"
            options={[
              { value: "main", label: "פעילות מתוכננת" },
              { value: "side", label: "הרגל יומי" },
            ]}
          />
        </Field>
        <Field label="תדירות">
          <Segmented
            value={frequency}
            onChange={setFrequency}
            className="w-full"
            options={[
              { value: "daily", label: "כל יום" },
              { value: "specific_days", label: "ימים קבועים" },
              { value: "weekly_count", label: "X בשבוע" },
            ]}
          />
        </Field>
        {frequency === "specific_days" ? (
          <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="ימים בשבוע">
            {WEEKDAY_SHORT.map((d, i) => (
              <button
                key={d}
                aria-pressed={days.includes(i)}
                onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i].sort()))}
                className={cn("h-11 rounded-xl text-sm font-medium", days.includes(i) ? "bg-accent text-accent-ink" : "bg-sunken text-ink-2")}
              >
                {d}
              </button>
            ))}
          </div>
        ) : null}
        {frequency === "weekly_count" ? (
          <Field label="כמה פעמים בשבוע?">
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button key={n} onClick={() => setWeeklyTarget(n)} className={cn("num h-11 rounded-xl text-sm font-medium", weeklyTarget === n ? "bg-accent text-accent-ink" : "bg-sunken text-ink-2")}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
        ) : null}
        <Field label="מדידה">
          <Segmented
            value={kind}
            onChange={setKind}
            className="w-full"
            options={[
              { value: "boolean", label: "בוצע / לא בוצע" },
              { value: "quantity", label: "כמות מול יעד" },
            ]}
          />
        </Field>
        {kind === "quantity" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="יעד">
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="20" className="num" />
            </Field>
            <Field label="יחידה">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="דקות" />
            </Field>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="שעה רגילה" hint="עוזר לתזכורות חכמות.">
            <Input type="time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className="ltr num" />
          </Field>
          <Field label="תווית זמן" hint="מוצגת ליד ההרגל.">
            <Input value={timeLabel} onChange={(e) => setTimeLabel(e.target.value)} placeholder="ערב" />
          </Field>
        </div>
        <Field label="השלמה אוטומטית מנתונים" hint="למשל: צעדים שמגיעים מאפל הבריאות יסמנו את ההרגל לבד.">
          <Select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
            <option value="">ללא</option>
            {LINKABLE.map((k) => (
              <option key={k} value={k}>
                {METRIC_MAP.get(k)?.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="תיאור (לא חובה)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="rounded-2xl bg-surface-2 px-4 ring-1 ring-line">
          <Switch checked={reminder} onCheckedChange={setReminder} label="תזכורת חכמה" description="נשלחת רק אם ההרגל עוד לא בוצע, בזמן שמתאים ליומן ולהרגלים שלך." />
        </div>
      </div>
    </Sheet>
  );
}
