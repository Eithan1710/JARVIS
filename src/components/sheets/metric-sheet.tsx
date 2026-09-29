"use client";
import { useEffect, useMemo, useState } from "react";
import { addDays } from "@/lib/dates";
import { BUILTIN_METRICS, METRIC_MAP, bedtimeFromClock } from "@/lib/metrics";
import { useAddMetric } from "@/client/mutations";
import { useToday } from "@/client/today";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { Chip, Field, Input, Segmented, Select } from "../ui/field";

const WORKOUT_TYPES = ["כוח", "ריצה", "הליכה", "אופניים", "שחייה", "ריקוד", "יוגה", "אחר"];
const MANUAL_KEYS = BUILTIN_METRICS.filter((m) => m.input).map((m) => m.key);

export function MetricSheet({ open, onOpenChange, metricKey }: { open: boolean; onOpenChange: (o: boolean) => void; metricKey?: string }) {
  const today = useToday();
  const [key, setKey] = useState(metricKey ?? "sleep_hours");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [value, setValue] = useState("");
  const [hours, setHours] = useState("7");
  const [minutes, setMinutes] = useState("30");
  const [bedtime, setBedtime] = useState("23:30");
  const [workoutType, setWorkoutType] = useState("כוח");
  const add = useAddMetric();

  useEffect(() => {
    if (open) {
      setKey(metricKey ?? "sleep_hours");
      setValue("");
      setDay("today");
    }
  }, [open, metricKey]);

  const def = METRIC_MAP.get(key);
  const date = day === "today" ? today : addDays(today, -1);
  const isSleep = key === "sleep_hours";
  const isDuration = def?.format === "hours" && !isSleep;
  const title = useMemo(() => (metricKey ? `רישום ${def?.label ?? "נתון"}` : "רישום נתון"), [metricKey, def]);

  const submit = async () => {
    if (isSleep) {
      const v = Number(hours) + Number(minutes) / 60;
      if (!Number.isFinite(v) || v <= 0) return;
      await add.mutateAsync({ metricKey: "sleep_hours", value: Math.round(v * 100) / 100, date });
      if (bedtime) await add.mutateAsync({ metricKey: "bedtime", value: bedtimeFromClock(bedtime), date });
    } else {
      const v = Number(value.replace(",", "."));
      if (!Number.isFinite(v)) return;
      await add.mutateAsync({ metricKey: key, value: v, date, note: key === "workout_minutes" ? workoutType : null, meta: key === "workout_minutes" ? { type: workoutType } : undefined });
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} footer={<Button block size="lg" onClick={submit} loading={add.isPending}>שמירה</Button>}>
      <div className="space-y-5 pt-1">
        {!metricKey ? (
          <Field label="מה מודדים?">
            <Select value={key} onChange={(e) => setKey(e.target.value)}>
              {MANUAL_KEYS.map((k) => (
                <option key={k} value={k}>
                  {METRIC_MAP.get(k)!.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Segmented
          value={day}
          onChange={setDay}
          className="w-full"
          options={[
            { value: "today", label: isSleep ? "הלילה (התעוררתי היום)" : "היום" },
            { value: "yesterday", label: isSleep ? "לילה קודם" : "אתמול" },
          ]}
        />
        {isSleep ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="שעות">
                <Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} className="num text-center text-lg" />
              </Field>
              <Field label="דקות">
                <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="num text-center text-lg" />
              </Field>
            </div>
            <Field label="נרדמתי בערך ב־" hint="לא חובה. עוזר לזהות קשר בין שעת השינה לאנרגיה.">
              <Input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} className="ltr num text-center" />
            </Field>
          </>
        ) : (
          <>
            {key === "workout_minutes" ? (
              <div>
                <div className="mb-2 text-sm font-medium text-ink-2">סוג</div>
                <div className="flex flex-wrap gap-2">
                  {WORKOUT_TYPES.map((t) => (
                    <Chip key={t} active={workoutType === t} onClick={() => setWorkoutType(t)}>
                      {t}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
            <Field label={`${def?.label ?? "ערך"}${def?.unit ? ` (${isDuration ? "שעות" : def.unit})` : ""}`}>
              <Input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={key === "steps" ? "8000" : key === "weight" ? "78.4" : key === "workout_minutes" ? "60" : ""} className="num text-center text-2xl font-semibold" />
            </Field>
          </>
        )}
      </div>
    </Sheet>
  );
}
