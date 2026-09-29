"use client";
import { closeSheet, ui, useStore } from "@/client/store";
import { QuickAddSheet } from "./quick-add";
import { CheckinSheet } from "./checkin-sheet";
import { NotificationsSheet } from "./notifications-sheet";
import { MetricSheet } from "./metric-sheet";
import { TransactionSheet } from "./transaction-sheet";
import { JournalSheet } from "./journal-sheet";
import { HabitFormSheet } from "./habit-form";
import { GoalFormSheet } from "./goal-form";
import { HabitLogSheet } from "./habit-log-sheet";
import { ExperimentFormSheet } from "./experiment-form";

/** Renders whichever global sheet is open. */
export function SheetHost() {
  const sheet = useStore(ui, (s) => s.sheet);
  const onOpenChange = (o: boolean) => {
    if (!o) closeSheet();
  };
  return (
    <>
      <QuickAddSheet open={sheet === "quick-add"} onOpenChange={onOpenChange} />
      <CheckinSheet open={sheet === "checkin"} onOpenChange={onOpenChange} />
      <NotificationsSheet open={sheet === "notifications"} onOpenChange={onOpenChange} />
      <MetricSheet open={typeof sheet === "object" && sheet?.kind === "metric"} metricKey={typeof sheet === "object" && sheet?.kind === "metric" ? sheet.metricKey : undefined} onOpenChange={onOpenChange} />
      <TransactionSheet open={typeof sheet === "object" && sheet?.kind === "transaction"} onOpenChange={onOpenChange} />
      <JournalSheet open={typeof sheet === "object" && sheet?.kind === "journal"} onOpenChange={onOpenChange} />
      <HabitFormSheet open={typeof sheet === "object" && sheet?.kind === "habit-form"} habitId={typeof sheet === "object" && sheet?.kind === "habit-form" ? sheet.habitId : undefined} onOpenChange={onOpenChange} />
      <GoalFormSheet open={typeof sheet === "object" && sheet?.kind === "goal-form"} goalId={typeof sheet === "object" && sheet?.kind === "goal-form" ? sheet.goalId : undefined} onOpenChange={onOpenChange} />
      <HabitLogSheet
        open={typeof sheet === "object" && sheet?.kind === "habit-log"}
        habitId={typeof sheet === "object" && sheet?.kind === "habit-log" ? sheet.habitId : ""}
        date={typeof sheet === "object" && sheet?.kind === "habit-log" ? sheet.date : ""}
        onOpenChange={onOpenChange}
      />
      <ExperimentFormSheet open={typeof sheet === "object" && sheet?.kind === "experiment-form"} onOpenChange={onOpenChange} />
    </>
  );
}
