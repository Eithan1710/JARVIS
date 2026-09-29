"use client";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "./api";
import { qk, type Dashboard, type HabitSummaryJ } from "./queries";
import { toast } from "./store";
import { uuid } from "@/lib/utils";

type HabitStatus = "completed" | "partial" | "missed" | "skipped";

function patchHabitCaches(qc: QueryClient, habitId: string, date: string, status: HabitStatus | null, value?: number | null) {
  const patch = (h: { today: { date: string; status: string | null; value: number | null }; recent?: { date: string; status: string | null; value: number | null }[] }) => {
    const next = { ...h };
    if (h.today.date === date) next.today = { ...h.today, status, value: value ?? h.today.value };
    if (h.recent) next.recent = h.recent.map((r) => (r.date === date ? { ...r, status, value: value ?? r.value } : r));
    return next;
  };
  qc.setQueryData<Dashboard>(qk.dashboard, (d) => (d ? { ...d, habits: d.habits.map((h) => (h.id === habitId ? (patch(h) as typeof h) : h)) } : d));
  qc.setQueriesData<HabitSummaryJ[]>({ queryKey: ["habits"] }, (list) => list?.map((s) => (s.habit.id === habitId ? (patch(s) as typeof s) : s)));
}

/** Mark a habit outcome. Optimistic, and queued offline if needed. */
export function useLogHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { habitId: string; date: string; status: HabitStatus | null; value?: number | null; note?: string | null }) => {
      const body = v.status === null ? { date: v.date, clear: true } : { date: v.date, status: v.status, value: v.value ?? null, note: v.note ?? null, occurredAt: new Date().toISOString() };
      return api.post(`/api/habits/${v.habitId}/log`, body, { offline: true, label: "סימון הרגל" });
    },
    onMutate: (v) => {
      patchHabitCaches(qc, v.habitId, v.date, v.status, v.value);
      if (v.status === "completed" && navigator.vibrate) navigator.vibrate(8);
    },
    onError: (e) => {
      toast(errorMessage(e), { tone: "error" });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: ["habits"] });
    },
    onSuccess: (res) => {
      if (!res.queued) {
        void qc.invalidateQueries({ queryKey: qk.dashboard });
        void qc.invalidateQueries({ queryKey: ["habits"] });
        void qc.invalidateQueries({ queryKey: ["habit"] });
      }
    },
  });
}

export function useSaveCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; mood?: number | null; energy?: number | null; focus?: number | null; note?: string | null; highlight?: string | null; tags?: string[] }) =>
      api.put("/api/checkins", v, { offline: true, label: "צ׳ק־אין" }),
    onSuccess: (res, v) => {
      if (!res.queued) toast("הצ׳ק־אין נשמר", { tone: "success" });
      void qc.invalidateQueries({ queryKey: qk.checkin(v.date) });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (e) => toast(errorMessage(e), { tone: "error" }),
  });
}

export function useAddMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { metricKey: string; value: number; date: string; note?: string | null; startAt?: string | null; endAt?: string | null; meta?: Record<string, unknown> }) =>
      api.post("/api/metrics", { ...v, clientId: uuid() }, { offline: true, label: "רישום נתון" }),
    onSuccess: (res) => {
      if (!res.queued) toast("נשמר", { tone: "success" });
      void qc.invalidateQueries();
    },
    onError: (e) => toast(errorMessage(e), { tone: "error" }),
  });
}

export function useAddTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; amount: number; category: string; description?: string | null; merchant?: string | null }) =>
      api.post("/api/transactions", { ...v, clientId: uuid() }, { offline: true, label: "רישום הוצאה" }),
    onSuccess: (res) => {
      if (!res.queued) toast("ההוצאה נשמרה", { tone: "success" });
      void qc.invalidateQueries();
    },
    onError: (e) => toast(errorMessage(e), { tone: "error" }),
  });
}

export function useAddJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; body: string; title?: string | null; tags?: string[]; important?: boolean }) =>
      api.post("/api/journal", { ...v, clientId: uuid() }, { offline: true, label: "רשומת יומן" }),
    onSuccess: (res) => {
      if (!res.queued) toast("נשמר ביומן", { tone: "success" });
      void qc.invalidateQueries({ queryKey: ["journal"] });
      void qc.invalidateQueries({ queryKey: ["timeline"] });
    },
    onError: (e) => toast(errorMessage(e), { tone: "error" }),
  });
}

/** Generic mutation with toast + broad invalidation, for less frequent actions. */
export function useAction<V, R = unknown>(fn: (v: V) => Promise<R>, opts: { success?: string; invalidate?: readonly unknown[][] | "all"; onSuccess?: (r: R, v: V) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opts.success) toast(opts.success, { tone: "success" });
      if (opts.invalidate === "all" || !opts.invalidate) void qc.invalidateQueries();
      else for (const k of opts.invalidate) void qc.invalidateQueries({ queryKey: k });
      opts.onSuccess?.(r, v);
    },
    onError: (e) => toast(errorMessage(e), { tone: "error" }),
  });
}
