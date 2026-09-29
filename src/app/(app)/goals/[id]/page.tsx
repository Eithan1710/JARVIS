"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useGoal, useHabits } from "@/client/queries";
import { useAction } from "@/client/mutations";
import { openSheet } from "@/client/store";
import { api } from "@/client/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ErrorState, ProgressBar, Skeleton, Stat } from "@/components/ui/misc";
import { TrendChart } from "@/components/charts";

export default function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: g, isLoading, error, refetch } = useGoal(id);
  const { data: habits } = useHabits();
  const [value, setValue] = useState("");
  const [milestone, setMilestone] = useState("");
  const inv = [["goal", id], ["goals"], ["dashboard"]];
  const progress = useAction((v: number) => api.post(`/api/goals/${id}/progress`, { value: v }), { success: "ההתקדמות נשמרה", invalidate: inv, onSuccess: () => setValue("") });
  const addMs = useAction((t: string) => api.post(`/api/goals/${id}/milestones`, { title: t }), { invalidate: inv, onSuccess: () => setMilestone("") });
  const toggleMs = useAction((v: { mid: string; done: boolean }) => api.patch(`/api/goals/${id}/milestones/${v.mid}`, { done: v.done }), { invalidate: inv });
  const status = useAction((s: string) => api.patch(`/api/goals/${id}`, { status: s }), { success: "עודכן", invalidate: inv });
  const remove = useAction(() => api.del(`/api/goals/${id}`), { success: "המטרה נמחקה", onSuccess: () => router.push("/goals") });

  if (isLoading && !g) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (error || !g) return <ErrorState onRetry={() => refetch()} />;
  const linked = (habits ?? []).filter((h) => g.habitIds.includes(h.habit.id));

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h1 className="text-title font-semibold">{g.goal.title}</h1>
          {g.goal.description ? <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-muted">{g.goal.description}</p> : null}
        </div>
        <div className="flex gap-1">
          <Button variant="subtle" size="sm" onClick={() => openSheet({ kind: "goal-form", goalId: id })}>
            <Pencil className="size-4" /> עריכה
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="מחיקה" onClick={() => confirm("למחוק את המטרה?") && remove.mutate(undefined)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <Card className="p-4 md:p-5">
        <ProgressBar value={g.progress} expected={g.expectedProgress} tone={g.goal.status === "completed" ? "positive" : "accent"} className="h-3" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="התקדמות" value={g.progress != null ? `${Math.round(g.progress * 100)}%` : "—"} sub={g.progressLabel} />
          <Stat label="צפוי עד היום" value={g.expectedProgress != null ? `${Math.round(g.expectedProgress * 100)}%` : "—"} sub="לפי קצב אחיד" />
          <Stat label="דדליין" value={g.goal.deadline ? formatDate(g.goal.deadline, { short: true }) : "—"} sub={g.daysLeft != null ? (g.daysLeft >= 0 ? `עוד ${g.daysLeft} ימים` : "עבר") : undefined} />
          <Stat label="עקביות הרגלים" value={g.habitConsistency != null ? `${Math.round(g.habitConsistency * 100)}%` : "—"} sub="30 יום" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {g.goal.status !== "completed" ? (
            <Button size="sm" variant="secondary" onClick={() => status.mutate("completed")}>
              <Check className="size-4" /> סימון כהושגה
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => status.mutate("active")}>
              החזרה לפעילה
            </Button>
          )}
          {g.goal.status === "active" ? (
            <Button size="sm" variant="ghost" onClick={() => status.mutate("paused")}>
              השהיה
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {g.goal.progressMode === "manual" ? (
          <Card>
            <CardHeader title="התקדמות לאורך זמן" />
            <CardBody>
              <TrendChart points={g.history.map((h) => ({ x: h.recordedAt.slice(0, 10), y: h.value }))} format="decimal" height={200} reference={g.goal.targetValue != null ? { y: g.goal.targetValue, label: "יעד" } : null} label={g.goal.unit ?? "ערך"} />
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Number(value.replace(",", "."));
                  if (Number.isFinite(v) && value) progress.mutate(v);
                }}
              >
                <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`ערך נוכחי${g.goal.unit ? ` (${g.goal.unit})` : ""}`} className="num" />
                <Button type="submit" loading={progress.isPending} disabled={!value}>
                  עדכון
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="אבני דרך" subtitle={g.milestones.length ? `${g.milestones.filter((m) => m.completedAt).length} מתוך ${g.milestones.length}` : undefined} />
          <CardBody>
            <ul className="space-y-1">
              {g.milestones.map((m) => (
                <li key={m.id}>
                  <button onClick={() => toggleMs.mutate({ mid: m.id, done: !m.completedAt })} className="flex w-full items-center gap-3 rounded-xl py-2 text-start hover:bg-surface-2">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2", m.completedAt ? "border-accent bg-accent text-accent-ink" : "border-line-strong")}>{m.completedAt ? <Check className="size-3.5" strokeWidth={3} /> : null}</span>
                    <span className={cn("text-[15px]", m.completedAt && "text-muted line-through")}>{m.title}</span>
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (milestone.trim()) addMs.mutate(milestone.trim());
              }}
            >
              <Input value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder="אבן דרך חדשה" />
              <Button type="submit" variant="subtle" size="icon" aria-label="הוספה" loading={addMs.isPending}>
                <Plus className="size-5" />
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="הרגלים שתומכים במטרה" subtitle="מטרה → הרגלים → התנהגות → התקדמות" />
          <CardBody>
            {linked.length ? (
              <ul className="space-y-3">
                {linked.map((h) => (
                  <li key={h.habit.id}>
                    <Link href={`/habits/${h.habit.id}`} className="block">
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{h.habit.name}</span>
                        <span className="num text-muted">{h.rate30 != null ? `${Math.round(h.rate30 * 100)}%` : "—"}</span>
                      </div>
                      <ProgressBar value={h.rate30} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                לא קושרו הרגלים.{" "}
                <button className="font-medium text-accent" onClick={() => openSheet({ kind: "goal-form", goalId: id })}>
                  קישור הרגלים
                </button>
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
