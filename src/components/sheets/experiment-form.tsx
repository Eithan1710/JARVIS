"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/client/api";
import { useAction } from "@/client/mutations";
import { useToday } from "@/client/today";
import { CORE_FIELDS } from "@/lib/frame-fields";
import { METRIC_MAP } from "@/lib/metrics";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { Chip, Field, Input, Textarea } from "../ui/field";

const TARGETS = ["sleep_hours", "bedtime", "energy", "focus", "mood", "habit_rate", "exercised", "steps", "screen_time_hours", "deep_work_hours", "spending", "weight"];
const TEMPLATES = [
  { title: "ללכת לישון לפני 23:30", intervention: "כיבוי מסכים ב־23:00", compliance: "נרדמתי לפני 23:30", targets: ["sleep_hours", "energy", "focus"] },
  { title: "בלי טלפון בשעה הראשונה של הבוקר", intervention: "הטלפון נשאר במצב טיסה עד שעה אחרי ההתעוררות", compliance: "בוקר בלי טלפון", targets: ["focus", "mood", "energy"] },
  { title: "הליכה של 20 דקות אחרי ארוחת צהריים", intervention: "הליכה קבועה בצהריים", compliance: "הליכה בצהריים", targets: ["energy", "focus", "steps"] },
  { title: "בלי קפאין אחרי 14:00", intervention: "קפה אחרון לפני 14:00", compliance: "בלי קפאין אחרי 14:00", targets: ["sleep_hours", "bedtime", "energy"] },
];

const label = (k: string) => CORE_FIELDS[k]?.label ?? METRIC_MAP.get(k)?.label ?? k;

export function ExperimentFormSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const today = useToday();
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [intervention, setIntervention] = useState("");
  const [start, setStart] = useState(today);
  const [duration, setDuration] = useState(21);
  const [targets, setTargets] = useState<string[]>(["energy"]);
  const [compliance, setCompliance] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setHypothesis("");
      setIntervention("");
      setStart(today);
      setDuration(21);
      setTargets(["energy"]);
      setCompliance("");
    }
  }, [open, today]);

  const create = useAction(
    () =>
      api.post<{ id: string }>("/api/experiments", {
        title: title.trim(),
        hypothesis: hypothesis.trim() || null,
        intervention: intervention.trim() || null,
        startDate: start,
        durationDays: duration,
        baselineDays: 21,
        targetKeys: targets,
        complianceHabitName: compliance.trim() || null,
      }),
    {
      success: "הניסוי נוצר",
      onSuccess: (r) => {
        onOpenChange(false);
        const id = (r as { data?: { id?: string } | null }).data?.id;
        if (id) router.push(`/experiments/${id}`);
      },
    },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="ניסוי אישי חדש" description="משנים דבר אחד לתקופה קצרה, ובודקים מה קרה בנתונים." tall footer={<Button block size="lg" onClick={() => create.mutate(undefined)} loading={create.isPending} disabled={!title.trim() || !targets.length}>יצירת ניסוי</Button>}>
      <div className="space-y-5 pt-1">
        {!title ? (
          <div>
            <div className="mb-2 text-sm font-medium text-ink-2">רעיונות</div>
            <div className="space-y-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  onClick={() => {
                    setTitle(t.title);
                    setIntervention(t.intervention);
                    setCompliance(t.compliance);
                    setTargets(t.targets);
                  }}
                  className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-start text-[15px] ring-1 ring-line hover:bg-sunken"
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Field label="מה משנים?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: ללכת לישון לפני 23:30" />
        </Field>
        <Field label="מה אני מצפה שיקרה? (לא חובה)">
          <Textarea rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="יותר אנרגיה בבוקר" />
        </Field>
        <Field label="מה בודקים?" hint="הנתונים יושוו לשלושת השבועות שלפני הניסוי.">
          <div className="flex flex-wrap gap-2">
            {TARGETS.map((k) => (
              <Chip key={k} active={targets.includes(k)} onClick={() => setTargets((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k].slice(-6)))}>
                {label(k)}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="התחלה">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="ltr num" />
          </Field>
          <Field label="משך (ימים)">
            <Input inputMode="numeric" value={String(duration)} onChange={(e) => setDuration(Math.max(5, Math.min(120, Number(e.target.value) || 0)))} className="num" />
          </Field>
        </div>
        <Field label="מעקב עמידה (לא חובה)" hint="יוצר הרגל יומי זמני כדי לדעת באילו ימים באמת עמדת בניסוי.">
          <Input value={compliance} onChange={(e) => setCompliance(e.target.value)} placeholder="נרדמתי לפני 23:30" />
        </Field>
      </div>
    </Sheet>
  );
}
