"use client";
/**
 * Typed data hooks. Response types come from the server modules (type-only imports), with
 * Dates turned into strings to reflect JSON serialization.
 */
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { dashboard, dataInventory, systemStatus } from "@/server/services/system";
import type { HabitSummary, habitDetail, HabitRow } from "@/server/services/habits";
import type { GoalView } from "@/server/services/goals";
import type { InsightRow, getInsight } from "@/server/services/insights";
import type { TimelineDay } from "@/server/services/timeline";
import type { MemoryRow } from "@/server/services/memory";
import type { listExperiments, getExperiment } from "@/server/services/experiments";
import type { listIntegrations } from "@/server/integrations/service";
import type { IntegrationDefinition } from "@/server/integrations/types";
import type { Settings } from "@/lib/settings";
import type { dailyCheckins, journalEntries, reports, aiConversations, aiMessages, notifications, metrics, transactions } from "@/server/db/schema";

type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;
type Awaited2<T> = T extends Promise<infer U> ? U : T;
type R<F extends (...args: never[]) => unknown> = Jsonify<Awaited2<ReturnType<F>>>;

export type Dashboard = R<typeof dashboard>;
export type HabitSummaryJ = Jsonify<HabitSummary>;
export type HabitDetail = R<typeof habitDetail>;
export type HabitJ = Jsonify<HabitRow>;
export type GoalViewJ = Jsonify<GoalView>;
export type InsightJ = Jsonify<InsightRow>;
export type InsightDetail = R<typeof getInsight>;
export type MemoryJ = Jsonify<MemoryRow>;
export type ExperimentListItem = R<typeof listExperiments>[number];
export type ExperimentJ = R<typeof getExperiment>;
export type IntegrationsResponse = { catalog: (Omit<IntegrationDefinition, "sync"> & { pull: boolean })[]; connected: R<typeof listIntegrations> };
export type SystemStatus = R<typeof systemStatus>;
export type DataInventory = R<typeof dataInventory>;
export type Checkin = Jsonify<typeof dailyCheckins.$inferSelect>;
export type JournalEntry = Jsonify<typeof journalEntries.$inferSelect>;
export type Report = Jsonify<typeof reports.$inferSelect>;
export type Conversation = Jsonify<typeof aiConversations.$inferSelect>;
export type Message = Jsonify<typeof aiMessages.$inferSelect>;
export type NotificationJ = Jsonify<typeof notifications.$inferSelect>;
export type MetricJ = Jsonify<typeof metrics.$inferSelect>;
export type TransactionJ = Jsonify<typeof transactions.$inferSelect>;

export const qk = {
  dashboard: ["dashboard"] as const,
  habits: (date?: string) => ["habits", date ?? "today"] as const,
  habit: (id: string) => ["habit", id] as const,
  goals: ["goals"] as const,
  goal: (id: string) => ["goal", id] as const,
  insights: ["insights"] as const,
  insight: (id: string) => ["insight", id] as const,
  timeline: (from: string, to: string) => ["timeline", from, to] as const,
  journal: (q: string) => ["journal", q] as const,
  checkin: (date: string) => ["checkin", date] as const,
  checkins: (from: string, to: string) => ["checkins", from, to] as const,
  memories: ["memories"] as const,
  experiments: ["experiments"] as const,
  experiment: (id: string) => ["experiment", id] as const,
  integrations: ["integrations"] as const,
  settings: ["settings"] as const,
  system: ["system"] as const,
  conversations: ["conversations"] as const,
  conversation: (id: string) => ["conversation", id] as const,
  notifications: ["notifications"] as const,
  brief: (date: string) => ["brief", date] as const,
  weekly: (week: string) => ["weekly", week] as const,
  data: ["data"] as const,
  metrics: (params: string) => ["metrics", params] as const,
  transactions: (params: string) => ["transactions", params] as const,
  demo: ["demo"] as const,
};

export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: () => apiGet<Dashboard>("/api/dashboard") });
export const useHabits = (date?: string) =>
  useQuery({ queryKey: qk.habits(date), queryFn: () => apiGet<HabitSummaryJ[]>(`/api/habits${date ? `?date=${date}` : ""}`) });
export const useHabit = (id: string) => useQuery({ queryKey: qk.habit(id), queryFn: () => apiGet<HabitDetail>(`/api/habits/${id}`), enabled: Boolean(id) });
export const useGoals = () => useQuery({ queryKey: qk.goals, queryFn: () => apiGet<GoalViewJ[]>("/api/goals") });
export const useGoal = (id: string) => useQuery({ queryKey: qk.goal(id), queryFn: () => apiGet<GoalViewJ>(`/api/goals/${id}`), enabled: Boolean(id) });
export const useInsights = () => useQuery({ queryKey: qk.insights, queryFn: () => apiGet<InsightJ[]>("/api/insights") });
export const useInsight = (id: string) => useQuery({ queryKey: qk.insight(id), queryFn: () => apiGet<InsightDetail>(`/api/insights/${id}`), enabled: Boolean(id) });
export const useTimeline = (from: string, to: string) =>
  useQuery({ queryKey: qk.timeline(from, to), queryFn: () => apiGet<TimelineDay[]>(`/api/timeline?from=${from}&to=${to}`) });
export const useJournal = (q: string) =>
  useQuery({ queryKey: qk.journal(q), queryFn: () => apiGet<JournalEntry[]>(`/api/journal?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`) });
export const useCheckin = (date: string) => useQuery({ queryKey: qk.checkin(date), queryFn: () => apiGet<Checkin | null>(`/api/checkins?date=${date}`) });
export const useCheckins = (from: string, to: string) =>
  useQuery({ queryKey: qk.checkins(from, to), queryFn: () => apiGet<Checkin[]>(`/api/checkins?from=${from}&to=${to}`) });
export const useMemories = () => useQuery({ queryKey: qk.memories, queryFn: () => apiGet<MemoryJ[]>("/api/memories") });
export const useExperiments = () => useQuery({ queryKey: qk.experiments, queryFn: () => apiGet<ExperimentListItem[]>("/api/experiments") });
export const useExperiment = (id: string) => useQuery({ queryKey: qk.experiment(id), queryFn: () => apiGet<ExperimentJ>(`/api/experiments/${id}`), enabled: Boolean(id) });
export const useIntegrations = () => useQuery({ queryKey: qk.integrations, queryFn: () => apiGet<IntegrationsResponse>("/api/integrations") });
export const useSettings = () =>
  useQuery({ queryKey: qk.settings, queryFn: () => apiGet<{ displayName: string; timezone: string; settings: Settings }>("/api/settings") });
export const useSystem = () => useQuery({ queryKey: qk.system, queryFn: () => apiGet<SystemStatus>("/api/system") });
export const useConversations = () => useQuery({ queryKey: qk.conversations, queryFn: () => apiGet<Conversation[]>("/api/conversations") });
export const useConversation = (id: string | null) =>
  useQuery({
    queryKey: qk.conversation(id ?? "none"),
    queryFn: () => apiGet<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`),
    enabled: Boolean(id),
  });
export const useNotifications = (enabled = true) =>
  useQuery({ queryKey: qk.notifications, queryFn: () => apiGet<NotificationJ[]>("/api/notifications"), enabled, refetchInterval: 5 * 60_000 });
export const useDailyBrief = (date: string) => useQuery({ queryKey: qk.brief(date), queryFn: () => apiGet<Report>(`/api/reports/daily?date=${date}`) });
export const useWeeklyReview = (week: string) => useQuery({ queryKey: qk.weekly(week), queryFn: () => apiGet<Report>(`/api/reports/weekly?week=${week}`) });
export const useDataInventory = () => useQuery({ queryKey: qk.data, queryFn: () => apiGet<DataInventory>("/api/data") });
export const useMetrics = (params: string) => useQuery({ queryKey: qk.metrics(params), queryFn: () => apiGet<MetricJ[]>(`/api/metrics?${params}`) });
export const useTransactions = (params: string) =>
  useQuery({ queryKey: qk.transactions(params), queryFn: () => apiGet<TransactionJ[]>(`/api/transactions?${params}`) });
export const useDemo = () => useQuery({ queryKey: qk.demo, queryFn: () => apiGet<{ active: boolean }>("/api/demo") });
