import "server-only";
import type { UserContext } from "../context";
import { forgetMemoryTool, saveMemoryTool, searchHistoryTool, searchMemoryTool } from "./builtin/memory";
import { createGoalTool, createHabitTool, listGoalsTool, listHabitsTool, logHabitTool, updateGoalTool, updateHabitTool } from "./builtin/life";
import { createCalendarEventTool, openGithubTool, openMapsTool, openSpotifyTool, openUrlTool, openYoutubeTool } from "./builtin/open";
import { cancelReminderTool, completeTaskTool, createReminderTool, createTaskTool, listRemindersTool, listTasksTool } from "./builtin/planner";
import { fetchUrlTool, readGithubTool, searchWebTool } from "./builtin/web";
import type { ToolDefinition } from "./types";

/**
 * The Tool Layer. To add a capability, write a ToolDefinition and list it here — the Leader
 * discovers it from its name/description/signature. Nothing else changes.
 */
const TOOLS: ToolDefinition<never>[] = [
  // memory & history
  saveMemoryTool,
  searchMemoryTool,
  forgetMemoryTool,
  searchHistoryTool,
  // planning
  createReminderTool,
  listRemindersTool,
  cancelReminderTool,
  createTaskTool,
  listTasksTool,
  completeTaskTool,
  // goals & habits
  createGoalTool,
  updateGoalTool,
  listGoalsTool,
  createHabitTool,
  logHabitTool,
  listHabitsTool,
  updateHabitTool,
  // actions on the user's device
  openUrlTool,
  openYoutubeTool,
  openSpotifyTool,
  openMapsTool,
  openGithubTool,
  createCalendarEventTool,
  // information
  searchWebTool,
  fetchUrlTool,
  readGithubTool,
] as unknown as ToolDefinition<never>[];

let extra: ToolDefinition<never>[] = [];
/** Test/extension hook: register additional tools at runtime. */
export function registerTools(tools: ToolDefinition<never>[]) {
  extra = [...extra.filter((e) => !tools.some((t) => t.name === e.name)), ...tools];
}

export function toolsFor(ctx: UserContext): ToolDefinition<never>[] {
  return [...TOOLS, ...extra].filter((t) => !t.available || t.available(ctx));
}

export function getTool(ctx: UserContext, name: string): ToolDefinition<never> | undefined {
  return toolsFor(ctx).find((t) => t.name === name);
}
